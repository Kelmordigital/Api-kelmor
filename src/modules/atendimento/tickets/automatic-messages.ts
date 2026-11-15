import { eq, and, ne, desc } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import type { CompanyPermission } from '../../configuracao-geral/configuracao-geral.db.schema';
import type { CompanyPermissionsReader } from '../../configuracao-geral/configuracao-geral.service';
import { users } from '../../auth/auth.schema';
import { companies } from '../../companies/company.db.schema';
import { contacts, connections, queues, tickets, type Contact, type Ticket } from '../atendimento.db.schema';
import type { AtendimentoEvents, WhatsappSender } from '../atendimento.ports';
import type { MessageService } from '../mensagens/message.service';

/** Data/hora no fuso de São Paulo, formato DD/MM/AAAA HH:mm:ss (placeholder {hora}). */
export function formatHoraBR(date: Date): string {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Substitui {atendente}/{ticket}/{hora} (sem diferenciar maiúsculas) numa mensagem automática. */
export function fillMessageTemplate(template: string, vars: { atendente?: string; ticketId: number }, now: Date = new Date()): string {
    return template
        .replace(/\{atendente\}/gi, vars.atendente ?? 'atendente')
        .replace(/\{ticket\}/gi, String(vars.ticketId))
        .replace(/\{hora\}/gi, formatHoraBR(now));
}

/** Destino no WhatsApp: número quando existe, senão o LID (contato username-only). */
export function whatsappTargetOf(contact: Pick<Contact, 'number' | 'lid'> | null | undefined): string | null {
    return contact?.number || (contact?.lid ? `lid:${contact.lid}` : null);
}

/**
 * Mensagens automáticas do atendimento: saudação/protocolo ao assumir, saudação da fila,
 * aviso de transferência e despedida — mais a escolha da conexão por onde responder.
 */
export class AutomaticMessages {
    constructor(
        private readonly db: DbExecutor,
        private readonly perms: CompanyPermissionsReader,
        private readonly messages: Pick<MessageService, 'save' | 'hasRecentAuto'>,
        private readonly whatsapp: WhatsappSender,
        private readonly events: AtendimentoEvents,
    ) {}

    private async targetOf(contactId: number): Promise<string | null> {
        const [row] = await this.db.select({ number: contacts.number, lid: contacts.lid }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
        return whatsappTargetOf(row);
    }

    private async companyTexts(companyId: string) {
        const [row] = await this.db.select({
            init_message: companies.init_message, transfer_message: companies.transfer_message, end_message: companies.end_message,
        }).from(companies).where(eq(companies.id, companyId)).limit(1);
        return row;
    }

    private async nameOf(userId: string | null): Promise<string | undefined> {
        if (!userId) return undefined;
        const [row] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
        return row?.name ?? undefined;
    }

    /** Mensagem de despedida e config do modal de fechamento. */
    async closeConfig(companyId: string): Promise<{ end_message: string | null; send_ticket_goodbye_msg: boolean }> {
        const [texts, perms] = await Promise.all([this.companyTexts(companyId), this.perms.forCompany(companyId)]);
        return { end_message: texts?.end_message ?? null, send_ticket_goodbye_msg: perms.send_ticket_goodbye_msg };
    }

    /**
     * Conexão por onde responder o ticket. Se a do ticket estiver desconectada ou tiver
     * sido removida, usa outra conectada da mesma empresa (prefere WhatsApp comum à API
     * oficial) e move o ticket para ela. Sem nenhuma conectada, mantém a do ticket.
     */
    async resolveSendConnection(ticket: Pick<Ticket, 'id' | 'company_id' | 'connection_id'>): Promise<number | null> {
        const isUp = (id: number) => this.whatsapp.isConnected(id).catch(() => false);
        if (ticket.connection_id && await isUp(ticket.connection_id)) return ticket.connection_id;

        const candidates = await this.db
            .select({ id: connections.id, type: connections.type })
            .from(connections)
            .where(and(
                eq(connections.company_id, ticket.company_id),
                eq(connections.status, 'connected'),
                ticket.connection_id ? ne(connections.id, ticket.connection_id) : undefined,
            ))
            .orderBy(desc(connections.id));
        candidates.sort((a, b) => Number(a.type === 'whatsapp-oficial') - Number(b.type === 'whatsapp-oficial'));

        for (const candidate of candidates) {
            if (!(await isUp(candidate.id))) continue;
            const [moved] = await this.db.update(tickets).set({ connection_id: candidate.id, updated_at: new Date() }).where(eq(tickets.id, ticket.id)).returning();
            console.log(`[Ticket ${ticket.id}] conexão ${ticket.connection_id ?? '-'} indisponível — respondendo pela conexão ${candidate.id}`);
            if (moved) this.events.ticketUpdated(ticket.company_id, moved);
            return candidate.id;
        }
        return ticket.connection_id ?? null;
    }

    /** Saudação de abertura (com dedup por intervalo) e número do protocolo, ao assumir. */
    async sendOpening(ticket: Ticket, userId: string, perms: CompanyPermission): Promise<void> {
        if (!ticket.connection_id || !ticket.contact_id) return;
        const target = await this.targetOf(ticket.contact_id);
        if (!target) return;
        const texts = await this.companyTexts(ticket.company_id);

        if (perms.show_ticket_name_message && texts?.init_message) {
            const cutoff = new Date(Date.now() - (perms.interval_between_init_message ?? 1) * 3600 * 1000);
            if (!(await this.messages.hasRecentAuto(ticket.contact_id, 'auto_init', cutoff))) {
                const msg = fillMessageTemplate(texts.init_message, { atendente: (await this.nameOf(userId)) ?? 'nosso atendente', ticketId: ticket.id });
                await this.messages.save(ticket.id, ticket.contact_id, msg, true, ticket.company_id, { userId, mediaType: 'auto_init' });
                await this.whatsapp.sendTextToPhone(ticket.connection_id, target, msg);
            }
        }
        if (perms.send_ticket_protocol) {
            await this.whatsapp.sendTextToPhone(ticket.connection_id, target, `O número do protocolo de atendimento é *#${ticket.id}*.`);
        }
    }

    /** Saudação da fila (só na primeira vez que o ticket entra numa fila). */
    async sendQueueGreeting(ticket: Ticket, queueId: number): Promise<void> {
        if (!ticket.connection_id || !ticket.contact_id) return;
        const [queueRow] = await this.db.select({ greeting_message: queues.greeting_message }).from(queues).where(eq(queues.id, queueId)).limit(1);
        if (!queueRow?.greeting_message) return;
        const target = await this.targetOf(ticket.contact_id);
        if (!target) return;
        await this.messages.save(ticket.id, ticket.contact_id, queueRow.greeting_message, true, ticket.company_id, { mediaType: 'auto_queue_greeting' });
        await this.whatsapp.sendTextToPhone(ticket.connection_id, target, queueRow.greeting_message);
    }

    /** Aviso de transferência para o cliente (config send_ticket_transfer_msg). */
    async sendTransfer(ticket: Ticket, fromName: string | undefined, toName: string): Promise<void> {
        if (!ticket.connection_id || !ticket.contact_id) return;
        if (!(await this.perms.forCompany(ticket.company_id)).send_ticket_transfer_msg) return;
        const texts = await this.companyTexts(ticket.company_id);
        if (!texts?.transfer_message) return;
        const target = await this.targetOf(ticket.contact_id);
        if (!target) return;
        const msg = texts.transfer_message
            .replace(/\{atendente_anterior\}/gi, fromName ?? 'atendente anterior')
            .replace(/\{atendente\}/gi, toName);
        await this.whatsapp.sendTextToPhone(ticket.connection_id, target, msg);
    }

    /**
     * Despedida ao fechar. `sendGoodbye`: true → envia ignorando a permissão global;
     * false → não envia; undefined → respeita send_ticket_goodbye_msg.
     */
    async sendGoodbye(ticket: Ticket, companyId: string, sendGoodbye: boolean | undefined, userId: string | null): Promise<void> {
        if (!ticket.contact_id || sendGoodbye === false) return;
        const perms = await this.perms.forCompany(companyId);
        if (sendGoodbye === undefined && !perms.send_ticket_goodbye_msg) return;

        const texts = await this.companyTexts(companyId);
        if (!texts?.end_message) return;
        const target = await this.targetOf(ticket.contact_id);
        if (!target) return;
        if (!ticket.connection_id) {
            console.warn(`[_sendClosingMessage] Sem connection_id para ticket ${ticket.id} (contact: ${target}). Mensagem não será enviada.`);
            return;
        }
        // Número do ticket caído/removido: a despedida sai por outro número conectado
        const connectionId = await this.resolveSendConnection(ticket);
        if (!connectionId) return;

        // Dedup: evita reenviar despedida pro mesmo contato em sequência rápida
        const cutoff = new Date(Date.now() - (perms.interval_between_ended_message ?? 6) * 3600 * 1000);
        if (await this.messages.hasRecentAuto(ticket.contact_id, 'auto_goodbye', cutoff)) return;

        const text = fillMessageTemplate(texts.end_message, { atendente: (await this.nameOf(userId)) ?? 'atendente', ticketId: ticket.id });
        await this.messages.save(ticket.id, ticket.contact_id, text, true, companyId, { userId: userId ?? undefined, mediaType: 'auto_goodbye' });
        await this.whatsapp.sendTextToPhone(connectionId, target, text);
    }
}
