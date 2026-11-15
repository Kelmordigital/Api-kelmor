import { eq, and, asc, gte } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import { atendimento_messages, tickets, type AtMessage } from '../atendimento.db.schema';
import type { MessageAutoTagger } from '../../etiquetas/automatic-tag-rule.service';
import type { AtendimentoEvents, MessageRecorder, SaveMessageOptions } from '../atendimento.ports';
import { TicketNaoEncontradoError } from '../atendimento.errors';

/** Histórico de mensagens do atendimento. */
export class MessageService implements MessageRecorder {
    constructor(
        private readonly db: DbExecutor,
        private readonly events: AtendimentoEvents,
        private readonly autoTagger: MessageAutoTagger,
    ) {}

    async save(ticketId: number, contactId: number | null, body: string, fromMe: boolean, companyId: string, opts: SaveMessageOptions = {}): Promise<AtMessage> {
        const [msg] = await this.db.insert(atendimento_messages).values({
            ticket_id: ticketId,
            contact_id: contactId,
            user_id: opts.userId ?? null,
            body,
            from_me: fromMe,
            media_type: opts.mediaType ?? null,
            media_url: opts.mediaUrl ?? null,
            media_waveform: opts.mediaWaveform ?? null,
            media_seconds: opts.mediaSeconds ?? null,
        }).returning();

        await this.db.update(tickets).set({ updated_at: new Date() }).where(eq(tickets.id, ticketId));
        this.events.messageCreated(companyId, msg, ticketId);

        if (body && contactId !== null) {
            try {
                await this.autoTagger.applyFor(companyId, contactId, body);
            } catch (err) {
                console.error(`[AutoTags] Falha ao aplicar etiquetas automáticas (ticket ${ticketId}):`, err instanceof Error ? err.message : err);
            }
        }
        return msg;
    }

    async list(ticketId: number, companyId: string): Promise<AtMessage[]> {
        const [ticket] = await this.db.select({ id: tickets.id }).from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId))).limit(1);
        if (!ticket) throw new TicketNaoEncontradoError();
        return this.db.select().from(atendimento_messages)
            .where(eq(atendimento_messages.ticket_id, ticketId))
            .orderBy(asc(atendimento_messages.created_at));
    }

    /** Já houve mensagem automática deste tipo para o contato desde `since`? (dedup de saudação/despedida) */
    async hasRecentAuto(contactId: number, mediaType: string, since: Date): Promise<boolean> {
        const [recent] = await this.db.select({ id: atendimento_messages.id }).from(atendimento_messages).where(and(
            eq(atendimento_messages.contact_id, contactId),
            eq(atendimento_messages.media_type, mediaType),
            gte(atendimento_messages.created_at, since),
        )).limit(1);
        return !!recent;
    }

    /** Envio oficial devolve o wamid: grava para casar o ACK do webhook. */
    async setWamid(messageId: number, wamid: string): Promise<void> {
        await this.db.update(atendimento_messages).set({ wab_message_id: wamid, ack: 1 }).where(eq(atendimento_messages.id, messageId));
    }
}
