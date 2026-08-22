import cron from 'node-cron';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../../database/client';
import { campaigns, campaignConnections, campaignContacts, campaignSent } from './campanha.db.schema';
import { connections, contacts } from '../atendimento/atendimento.db.schema';

type ScheduledTask = ReturnType<typeof cron.schedule>;

const activeTasks = new Map<number, ScheduledTask>();

export async function scheduleCampaign(campaignId: number): Promise<void> {
    cancelCampaignTask(campaignId);

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return;

    const sendDate = new Date(campaign.send_date);
    const now = new Date();

    if (sendDate <= now) {
        setImmediate(() => executeCampaign(campaignId));
        return;
    }

    // Build cron expression from UTC components
    const m  = sendDate.getUTCMinutes();
    const h  = sendDate.getUTCHours();
    const d  = sendDate.getUTCDate();
    const mo = sendDate.getUTCMonth() + 1;
    const cronExpr = `${m} ${h} ${d} ${mo} *`;

    const task = cron.schedule(cronExpr, async () => {
        task.stop();
        activeTasks.delete(campaignId);
        await executeCampaign(campaignId);
    });

    activeTasks.set(campaignId, task);

    await db.update(campaigns)
        .set({ is_running: true, updated_at: new Date() })
        .where(eq(campaigns.id, campaignId));
}

export function cancelCampaignTask(campaignId: number): void {
    const task = activeTasks.get(campaignId);
    if (task) {
        task.stop();
        activeTasks.delete(campaignId);
    }
}

export async function resumeCampaign(campaignId: number): Promise<void> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign) return;

    const sendDate = new Date(campaign.send_date);
    if (sendDate > new Date()) {
        await scheduleCampaign(campaignId);
    } else {
        setImmediate(() => executeCampaign(campaignId));
    }
}

export async function restoreScheduledCampaigns(): Promise<void> {
    try {
        const running = await db.select().from(campaigns)
            .where(and(eq(campaigns.is_running, true), eq(campaigns.is_paused, false), eq(campaigns.is_sending, false)));

        for (const campaign of running) {
            const sendDate = new Date(campaign.send_date);
            if (sendDate > new Date()) {
                await scheduleCampaign(campaign.id);
                console.log(`[CampaignScheduler] Restored #${campaign.id} → ${sendDate.toISOString()}`);
            } else {
                setImmediate(() => executeCampaign(campaign.id));
            }
        }
    } catch (err: any) {
        console.error('[CampaignScheduler] Restore error:', err.message);
    }
}

async function executeCampaign(campaignId: number): Promise<void> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    if (!campaign || campaign.is_paused) return;

    await db.update(campaigns)
        .set({ is_running: true, is_sending: true, updated_at: new Date() })
        .where(eq(campaigns.id, campaignId));

    try {
        // Revalida (defesa em profundidade) que a conexão realmente pertence à
        // empresa da campanha, mesmo já filtrando na escrita em campanha.service.ts —
        // é aqui que o abuso se concretiza (envia mensagem usando o WhatsApp de outra empresa).
        const connLinks = await db.select({ connection_id: campaignConnections.connection_id })
            .from(campaignConnections)
            .innerJoin(connections, eq(connections.id, campaignConnections.connection_id))
            .where(and(
                eq(campaignConnections.campaign_id, campaignId),
                eq(connections.company_id, campaign.company_id),
            ));

        if (connLinks.length === 0) {
            console.warn(`[Campaign #${campaignId}] No connections configured`);
            await finishCampaign(campaignId);
            return;
        }

        const connectionId = connLinks[0].connection_id;

        // Resolve contacts
        let targets: { id: number; number: string | null }[] = [];

        if (campaign.all_contacts) {
            targets = await db.select({ id: contacts.id, number: contacts.number })
                .from(contacts)
                .where(eq(contacts.company_id, campaign.company_id));
        } else {
            const contactLinks = await db.select({ contact_id: campaignContacts.contact_id })
                .from(campaignContacts)
                .where(eq(campaignContacts.campaign_id, campaignId));

            if (contactLinks.length > 0) {
                // Mesma defesa em profundidade: só envia para contatos que
                // realmente pertencem à empresa da campanha.
                targets = await db.select({ id: contacts.id, number: contacts.number })
                    .from(contacts)
                    .where(and(
                        inArray(contacts.id, contactLinks.map(c => c.contact_id)),
                        eq(contacts.company_id, campaign.company_id),
                    ));
            }
        }

        // Skip already-sent contacts (supports resume after pause)
        const alreadySent = await db.select({ contact_id: campaignSent.contact_id })
            .from(campaignSent)
            .where(and(eq(campaignSent.campaign_id, campaignId), eq(campaignSent.is_sent, true)));
        const sentIds = new Set(alreadySent.map(s => s.contact_id));

        const toSend = targets.filter(c => c.number && !sentIds.has(c.id));

        const { whatsappService } = await import('../whatsapp/whatsapp.service');

        for (const contact of toSend) {
            const [current] = await db.select({ is_paused: campaigns.is_paused })
                .from(campaigns).where(eq(campaigns.id, campaignId));
            if (current?.is_paused) break;

            try {
                await whatsappService.sendTextToPhone(connectionId, contact.number!, campaign.message);

                await db.insert(campaignSent).values({
                    campaign_id: campaignId,
                    contact_id: contact.id,
                    number: contact.number,
                    is_sent: true,
                    sent_at: new Date(),
                });

                await db.update(campaigns)
                    .set({ send_contacts: sql`${campaigns.send_contacts} + 1`, updated_at: new Date() })
                    .where(eq(campaigns.id, campaignId));

                // Delay between sends to avoid rate limiting
                await new Promise(r => setTimeout(r, 1500));

            } catch (err: any) {
                await db.insert(campaignSent).values({
                    campaign_id: campaignId,
                    contact_id: contact.id,
                    number: contact.number,
                    is_sent: false,
                    sent_at: new Date(),
                    error: String(err.message ?? err).slice(0, 500),
                });
            }
        }

        await finishCampaign(campaignId);

    } catch (err: any) {
        console.error(`[Campaign #${campaignId}] Fatal error:`, err.message);
        await db.update(campaigns)
            .set({ is_running: false, is_sending: false, updated_at: new Date() })
            .where(eq(campaigns.id, campaignId));
    }
}

async function finishCampaign(campaignId: number): Promise<void> {
    await db.update(campaigns)
        .set({ is_running: false, is_sending: false, updated_at: new Date() })
        .where(eq(campaigns.id, campaignId));
    console.log(`[Campaign #${campaignId}] Completed`);
}