import { eq, and, desc, isNull, lt, lte, inArray, asc } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { tickets, contacts } from '../atendimento/atendimento.db.schema';
import { companies } from '../companies/company.db.schema';
import { scheduledMessages, ScheduledMessage } from './agendamento-mensagens.db.schema';

export interface NewScheduledMessage {
    company_id: string;
    ticket_id: number;
    contact_id: number;
    connection_id: number;
    created_by: string;
    message: string;
    send_date: Date;
}

export interface ScheduledMessageRepository {
    findTicket(ticketId: number, companyId: string): Promise<{ contact_id: number; connection_id: number | null } | null>;
    create(data: NewScheduledMessage): Promise<ScheduledMessage>;
    listByContact(companyId: string, contactId: number): Promise<ScheduledMessage[]>;
    findById(id: number, companyId: string): Promise<ScheduledMessage | null>;
    /**
     * Altera a mensagem só se ela ainda estiver aguardando envio — a condição
     * vai no próprio UPDATE, então não disputa com o disparador. null se não alterou.
     */
    updatePending(id: number, companyId: string, patch: { message?: string; send_date?: Date; status?: 'canceled' }): Promise<ScheduledMessage | null>;
    /**
     * Reserva até `limit` mensagens vencidas de empresas ativas, marcando-as
     * "sending" numa única operação. Instâncias concorrentes da API nunca
     * reservam a mesma mensagem.
     */
    claimDue(now: Date, limit: number): Promise<ScheduledMessage[]>;
    /** Marca como falha as mensagens vencidas de empresas desativadas (nunca são enviadas). */
    failDueOfInactiveCompanies(now: Date, reason: string): Promise<ScheduledMessage[]>;
    /** Marca como falha os envios que ficaram presos em "sending" desde antes de `before`. */
    failStuck(before: Date, reason: string): Promise<ScheduledMessage[]>;
    markSent(id: number, at: Date): Promise<void>;
    markFailed(id: number, error: string): Promise<void>;
    /** Nome do contato e destino no WhatsApp (número ou LID); target null se não houver. */
    contactInfo(contactId: number): Promise<{ name: string | null; target: string | null }>;
}

export class DrizzleScheduledMessageRepository implements ScheduledMessageRepository {
    constructor(private readonly db: DB) {}

    async findTicket(ticketId: number, companyId: string) {
        const [row] = await this.db.select({ contact_id: tickets.contact_id, connection_id: tickets.connection_id })
            .from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);
        return row ?? null;
    }

    async create(data: NewScheduledMessage): Promise<ScheduledMessage> {
        const [row] = await this.db.insert(scheduledMessages).values(data).returning();
        return row;
    }

    listByContact(companyId: string, contactId: number): Promise<ScheduledMessage[]> {
        return this.db.select().from(scheduledMessages)
            .where(and(eq(scheduledMessages.company_id, companyId), eq(scheduledMessages.contact_id, contactId)))
            .orderBy(desc(scheduledMessages.send_date));
    }

    async findById(id: number, companyId: string): Promise<ScheduledMessage | null> {
        const [row] = await this.db.select().from(scheduledMessages)
            .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.company_id, companyId), isNull(scheduledMessages.deleted_at)))
            .limit(1);
        return row ?? null;
    }

    async updatePending(id: number, companyId: string, patch: { message?: string; send_date?: Date; status?: 'canceled' }): Promise<ScheduledMessage | null> {
        const [row] = await this.db.update(scheduledMessages)
            .set({ ...patch, updated_at: new Date() })
            .where(and(
                eq(scheduledMessages.id, id),
                eq(scheduledMessages.company_id, companyId),
                eq(scheduledMessages.status, 'scheduled'),
                isNull(scheduledMessages.deleted_at),
            ))
            .returning();
        return row ?? null;
    }

    claimDue(now: Date, limit: number): Promise<ScheduledMessage[]> {
        return this.db.transaction(async (tx) => {
            // SKIP LOCKED: o que outra instância já está reservando fica para ela
            const due = await tx.select({ id: scheduledMessages.id }).from(scheduledMessages)
                .where(and(
                    eq(scheduledMessages.status, 'scheduled'),
                    isNull(scheduledMessages.deleted_at),
                    lte(scheduledMessages.send_date, now),
                    inArray(scheduledMessages.company_id, this.companiesWithStatus(true)),
                ))
                .orderBy(asc(scheduledMessages.send_date))
                .limit(limit)
                .for('update', { skipLocked: true });
            if (due.length === 0) return [];

            return tx.update(scheduledMessages)
                .set({ status: 'sending', updated_at: now })
                .where(inArray(scheduledMessages.id, due.map((d) => d.id)))
                .returning();
        });
    }

    failDueOfInactiveCompanies(now: Date, reason: string): Promise<ScheduledMessage[]> {
        return this.db.update(scheduledMessages)
            .set({ status: 'failed', last_error: reason, updated_at: now })
            .where(and(
                eq(scheduledMessages.status, 'scheduled'),
                isNull(scheduledMessages.deleted_at),
                lte(scheduledMessages.send_date, now),
                inArray(scheduledMessages.company_id, this.companiesWithStatus(false)),
            ))
            .returning();
    }

    private companiesWithStatus(active: boolean) {
        return this.db.select({ id: companies.id }).from(companies).where(eq(companies.status, active));
    }

    failStuck(before: Date, reason: string): Promise<ScheduledMessage[]> {
        return this.db.update(scheduledMessages)
            .set({ status: 'failed', last_error: reason, updated_at: new Date() })
            .where(and(eq(scheduledMessages.status, 'sending'), lt(scheduledMessages.updated_at, before)))
            .returning();
    }

    async markSent(id: number, at: Date): Promise<void> {
        await this.db.update(scheduledMessages)
            .set({ status: 'sent', sent_at: at, last_error: null, updated_at: at })
            .where(eq(scheduledMessages.id, id));
    }

    async markFailed(id: number, error: string): Promise<void> {
        await this.db.update(scheduledMessages)
            .set({ status: 'failed', last_error: error.slice(0, 500), updated_at: new Date() })
            .where(eq(scheduledMessages.id, id));
    }

    async contactInfo(contactId: number): Promise<{ name: string | null; target: string | null }> {
        const [contact] = await this.db.select({ name: contacts.name, number: contacts.number, lid: contacts.lid })
            .from(contacts).where(eq(contacts.id, contactId));
        return {
            name: contact?.name ?? null,
            target: contact?.number || (contact?.lid ? `lid:${contact.lid}` : null),
        };
    }
}
