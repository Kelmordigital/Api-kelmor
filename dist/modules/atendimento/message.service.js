"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("./atendimento.db.schema");
const socket_1 = require("../../shared/socket");
exports.messageService = {
    async save(ticketId, contactId, body, fromMe, companyId, opts = {}) {
        const [msg] = await client_1.db
            .insert(atendimento_db_schema_1.atendimento_messages)
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
        await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId));
        (0, socket_1.emitToCompany)(companyId, 'message:created', { message: msg, ticketId });
        return msg;
    },
    async list(ticketId, companyId) {
        const [ticket] = await client_1.db
            .select()
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!ticket)
            throw new Error('Ticket não encontrado');
        return client_1.db
            .select()
            .from(atendimento_db_schema_1.atendimento_messages)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.ticket_id, ticketId))
            .orderBy((0, drizzle_orm_1.asc)(atendimento_db_schema_1.atendimento_messages.created_at));
    },
};
//# sourceMappingURL=message.service.js.map