"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendamentoMensagensService = exports.TicketSemConexaoError = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const agendamento_mensagens_db_schema_1 = require("./agendamento-mensagens.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const agendamento_mensagens_scheduler_1 = require("./agendamento-mensagens.scheduler");
class TicketSemConexaoError extends Error {
    constructor() { super('Este ticket não tem uma conexão associada — não é possível agendar mensagem.'); }
}
exports.TicketSemConexaoError = TicketSemConexaoError;
exports.agendamentoMensagensService = {
    /** Agenda UMA mensagem para o contato do ticket informado. */
    async create(companyId, ticketId, userId, payload) {
        const [ticket] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!ticket)
            throw new Error('Ticket não encontrado');
        if (!ticket.connection_id)
            throw new TicketSemConexaoError();
        const [row] = await client_1.db.insert(agendamento_mensagens_db_schema_1.scheduledMessages).values({
            company_id: companyId,
            ticket_id: ticketId,
            contact_id: ticket.contact_id,
            connection_id: ticket.connection_id,
            created_by: userId,
            message: payload.message,
            send_date: new Date(payload.send_date),
        }).returning();
        await (0, agendamento_mensagens_scheduler_1.scheduleMessageTask)(row.id);
        return row;
    },
    /** Histórico de mensagens agendadas para o contato do ticket informado (todas as filas/tickets dele). */
    async listByTicketContact(companyId, ticketId) {
        const [ticket] = await client_1.db.select({ contact_id: atendimento_db_schema_1.tickets.contact_id }).from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!ticket)
            throw new Error('Ticket não encontrado');
        return client_1.db.select().from(agendamento_mensagens_db_schema_1.scheduledMessages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.company_id, companyId), (0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.contact_id, ticket.contact_id)))
            .orderBy((0, drizzle_orm_1.desc)(agendamento_mensagens_db_schema_1.scheduledMessages.send_date));
    },
};
//# sourceMappingURL=agendamento-mensagens.service.js.map