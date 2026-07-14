import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../database/client';
import { scheduledMessages, ScheduledMessage } from './agendamento-mensagens.db.schema';
import { tickets } from '../atendimento/atendimento.db.schema';
import { scheduleMessageTask } from './agendamento-mensagens.scheduler';

export class TicketSemConexaoError extends Error {
    constructor() { super('Este ticket não tem uma conexão associada — não é possível agendar mensagem.'); }
}

export const agendamentoMensagensService = {

    /** Agenda UMA mensagem para o contato do ticket informado. */
    async create(
        companyId: string,
        ticketId: number,
        userId: string,
        payload: { message: string; send_date: string },
    ): Promise<ScheduledMessage> {
        const [ticket] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);
        if (!ticket) throw new Error('Ticket não encontrado');
        if (!ticket.connection_id) throw new TicketSemConexaoError();

        const [row] = await db.insert(scheduledMessages).values({
            company_id:    companyId,
            ticket_id:     ticketId,
            contact_id:    ticket.contact_id,
            connection_id: ticket.connection_id,
            created_by:    userId,
            message:       payload.message,
            send_date:     new Date(payload.send_date),
        }).returning();

        await scheduleMessageTask(row.id);
        return row;
    },

    /** Histórico de mensagens agendadas para o contato do ticket informado (todas as filas/tickets dele). */
    async listByTicketContact(companyId: string, ticketId: number): Promise<ScheduledMessage[]> {
        const [ticket] = await db.select({ contact_id: tickets.contact_id }).from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);
        if (!ticket) throw new Error('Ticket não encontrado');

        return db.select().from(scheduledMessages)
            .where(and(eq(scheduledMessages.company_id, companyId), eq(scheduledMessages.contact_id, ticket.contact_id)))
            .orderBy(desc(scheduledMessages.send_date));
    },
};
