import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { db } from '../../database/client';
import { scheduledMessages } from './agendamento-mensagens.db.schema';
import { contacts } from '../atendimento/atendimento.db.schema';

type ScheduledTask = ReturnType<typeof cron.schedule>;

const activeTasks = new Map<number, ScheduledTask>();

/** Agenda o disparo (one-shot) de uma mensagem já gravada no banco. */
export async function scheduleMessageTask(id: number): Promise<void> {
    cancelMessageTask(id);

    const [row] = await db.select().from(scheduledMessages).where(eq(scheduledMessages.id, id));
    if (!row || row.status !== 'scheduled') return;

    const sendDate = new Date(row.send_date);
    const now = new Date();

    if (sendDate <= now) {
        setImmediate(() => executeScheduledMessage(id));
        return;
    }

    const m  = sendDate.getUTCMinutes();
    const h  = sendDate.getUTCHours();
    const d  = sendDate.getUTCDate();
    const mo = sendDate.getUTCMonth() + 1;
    const cronExpr = `${m} ${h} ${d} ${mo} *`;

    // Os campos acima vêm de getUTC*() — o node-cron precisa saber que são UTC,
    // senão interpreta no fuso local do servidor (ex.: America/Sao_Paulo, UTC-3),
    // disparando a mensagem 3h mais tarde do que o agendado.
    const task = cron.schedule(cronExpr, async () => {
        task.stop();
        activeTasks.delete(id);
        await executeScheduledMessage(id);
    }, { timezone: 'UTC' });

    activeTasks.set(id, task);
}

export function cancelMessageTask(id: number): void {
    const task = activeTasks.get(id);
    if (task) {
        task.stop();
        activeTasks.delete(id);
    }
}

/** Chamado no boot: recria em memória os agendamentos pendentes (o job em memória se perde a cada restart). */
export async function restoreScheduledMessages(): Promise<void> {
    try {
        const pending = await db.select().from(scheduledMessages)
            .where(eq(scheduledMessages.status, 'scheduled'));

        for (const row of pending) {
            const sendDate = new Date(row.send_date);
            if (sendDate > new Date()) {
                await scheduleMessageTask(row.id);
                console.log(`[ScheduledMessage] Restored #${row.id} → ${sendDate.toISOString()}`);
            } else {
                setImmediate(() => executeScheduledMessage(row.id));
            }
        }
    } catch (err: any) {
        console.error('[ScheduledMessage] Restore error:', err.message);
    }
}

async function executeScheduledMessage(id: number): Promise<void> {
    const [row] = await db.select().from(scheduledMessages).where(eq(scheduledMessages.id, id));
    if (!row || row.status !== 'scheduled') return;

    try {
        const [contact] = await db.select({ number: contacts.number, lid: contacts.lid })
            .from(contacts).where(eq(contacts.id, row.contact_id));

        const target = contact?.number || (contact?.lid ? `lid:${contact.lid}` : null);
        if (!target) {
            await db.update(scheduledMessages)
                .set({ status: 'failed', last_error: 'Contato sem número/LID', updated_at: new Date() })
                .where(eq(scheduledMessages.id, id));
            return;
        }

        const { whatsappService } = await import('../whatsapp/whatsapp.service');
        await whatsappService.sendTextToPhone(row.connection_id, target, row.message);

        await db.update(scheduledMessages)
            .set({ status: 'sent', sent_at: new Date(), updated_at: new Date() })
            .where(eq(scheduledMessages.id, id));

    } catch (err: any) {
        await db.update(scheduledMessages)
            .set({ status: 'failed', last_error: String(err.message ?? err).slice(0, 500), updated_at: new Date() })
            .where(eq(scheduledMessages.id, id));
    }
}
