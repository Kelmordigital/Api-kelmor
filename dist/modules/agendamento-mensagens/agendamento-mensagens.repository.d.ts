import type { DB } from '../../database/client';
import { ScheduledMessage } from './agendamento-mensagens.db.schema';
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
    findTicket(ticketId: number, companyId: string): Promise<{
        contact_id: number;
        connection_id: number | null;
    } | null>;
    create(data: NewScheduledMessage): Promise<ScheduledMessage>;
    listByContact(companyId: string, contactId: number): Promise<ScheduledMessage[]>;
    findById(id: number, companyId: string): Promise<ScheduledMessage | null>;
    /**
     * Altera a mensagem só se ela ainda estiver aguardando envio — a condição
     * vai no próprio UPDATE, então não disputa com o disparador. null se não alterou.
     */
    updatePending(id: number, companyId: string, patch: {
        message?: string;
        send_date?: Date;
        status?: 'canceled';
    }): Promise<ScheduledMessage | null>;
    /**
     * Reserva até `limit` mensagens vencidas, marcando-as "sending" numa única
     * operação. Instâncias concorrentes da API nunca reservam a mesma mensagem.
     */
    claimDue(now: Date, limit: number): Promise<ScheduledMessage[]>;
    /** Marca como falha os envios que ficaram presos em "sending" desde antes de `before`. */
    failStuck(before: Date, reason: string): Promise<ScheduledMessage[]>;
    markSent(id: number, at: Date): Promise<void>;
    markFailed(id: number, error: string): Promise<void>;
    /** Nome do contato e destino no WhatsApp (número ou LID); target null se não houver. */
    contactInfo(contactId: number): Promise<{
        name: string | null;
        target: string | null;
    }>;
}
export declare class DrizzleScheduledMessageRepository implements ScheduledMessageRepository {
    private readonly db;
    constructor(db: DB);
    findTicket(ticketId: number, companyId: string): Promise<{
        contact_id: number;
        connection_id: number | null;
    }>;
    create(data: NewScheduledMessage): Promise<ScheduledMessage>;
    listByContact(companyId: string, contactId: number): Promise<ScheduledMessage[]>;
    findById(id: number, companyId: string): Promise<ScheduledMessage | null>;
    updatePending(id: number, companyId: string, patch: {
        message?: string;
        send_date?: Date;
        status?: 'canceled';
    }): Promise<ScheduledMessage | null>;
    claimDue(now: Date, limit: number): Promise<ScheduledMessage[]>;
    failStuck(before: Date, reason: string): Promise<ScheduledMessage[]>;
    markSent(id: number, at: Date): Promise<void>;
    markFailed(id: number, error: string): Promise<void>;
    contactInfo(contactId: number): Promise<{
        name: string | null;
        target: string | null;
    }>;
}
//# sourceMappingURL=agendamento-mensagens.repository.d.ts.map