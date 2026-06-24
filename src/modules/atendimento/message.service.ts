import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../database/client';
import { atendimento_messages, tickets, AtMessage } from './atendimento.db.schema';
import { emitToCompany } from '../../shared/socket';

export const messageService = {
    async save(
        ticketId: number,
        contactId: number | null,
        body: string,
        fromMe: boolean,
        companyId: string,
        opts: { userId?: string; mediaType?: string; mediaUrl?: string } = {},
    ): Promise<AtMessage> {
        const [msg] = await db
            .insert(atendimento_messages)
            .values({
                ticket_id: ticketId,
                contact_id: contactId,
                user_id: opts.userId ?? null,
                body,
                from_me: fromMe,
                media_type: opts.mediaType ?? null,
                media_url: opts.mediaUrl ?? null,
            })
            .returning();

        await db
            .update(tickets)
            .set({ updated_at: new Date() })
            .where(eq(tickets.id, ticketId));

        emitToCompany(companyId, 'message:created', { message: msg, ticketId });
        return msg;
    },

    async list(ticketId: number, companyId: string): Promise<AtMessage[]> {
        const [ticket] = await db
            .select()
            .from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);

        if (!ticket) throw new Error('Ticket não encontrado');

        return db
            .select()
            .from(atendimento_messages)
            .where(eq(atendimento_messages.ticket_id, ticketId))
            .orderBy(asc(atendimento_messages.created_at));
    },
};
