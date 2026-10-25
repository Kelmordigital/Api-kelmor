"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleScheduledMessageRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const agendamento_mensagens_db_schema_1 = require("./agendamento-mensagens.db.schema");
class DrizzleScheduledMessageRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findTicket(ticketId, companyId) {
        const [row] = await this.db.select({ contact_id: atendimento_db_schema_1.tickets.contact_id, connection_id: atendimento_db_schema_1.tickets.connection_id })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        return row ?? null;
    }
    async create(data) {
        const [row] = await this.db.insert(agendamento_mensagens_db_schema_1.scheduledMessages).values(data).returning();
        return row;
    }
    listByContact(companyId, contactId) {
        return this.db.select().from(agendamento_mensagens_db_schema_1.scheduledMessages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.company_id, companyId), (0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.contact_id, contactId)))
            .orderBy((0, drizzle_orm_1.desc)(agendamento_mensagens_db_schema_1.scheduledMessages.send_date));
    }
    async findById(id, companyId) {
        const [row] = await this.db.select().from(agendamento_mensagens_db_schema_1.scheduledMessages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.id, id), (0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.company_id, companyId), (0, drizzle_orm_1.isNull)(agendamento_mensagens_db_schema_1.scheduledMessages.deleted_at)))
            .limit(1);
        return row ?? null;
    }
    async updatePending(id, companyId, patch) {
        const [row] = await this.db.update(agendamento_mensagens_db_schema_1.scheduledMessages)
            .set({ ...patch, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.id, id), (0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.company_id, companyId), (0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.status, 'scheduled'), (0, drizzle_orm_1.isNull)(agendamento_mensagens_db_schema_1.scheduledMessages.deleted_at)))
            .returning();
        return row ?? null;
    }
    claimDue(now, limit) {
        return this.db.transaction(async (tx) => {
            // SKIP LOCKED: o que outra instância já está reservando fica para ela
            const due = await tx.select({ id: agendamento_mensagens_db_schema_1.scheduledMessages.id }).from(agendamento_mensagens_db_schema_1.scheduledMessages)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.status, 'scheduled'), (0, drizzle_orm_1.isNull)(agendamento_mensagens_db_schema_1.scheduledMessages.deleted_at), (0, drizzle_orm_1.lte)(agendamento_mensagens_db_schema_1.scheduledMessages.send_date, now)))
                .orderBy((0, drizzle_orm_1.asc)(agendamento_mensagens_db_schema_1.scheduledMessages.send_date))
                .limit(limit)
                .for('update', { skipLocked: true });
            if (due.length === 0)
                return [];
            return tx.update(agendamento_mensagens_db_schema_1.scheduledMessages)
                .set({ status: 'sending', updated_at: now })
                .where((0, drizzle_orm_1.inArray)(agendamento_mensagens_db_schema_1.scheduledMessages.id, due.map((d) => d.id)))
                .returning();
        });
    }
    failStuck(before, reason) {
        return this.db.update(agendamento_mensagens_db_schema_1.scheduledMessages)
            .set({ status: 'failed', last_error: reason, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.status, 'sending'), (0, drizzle_orm_1.lt)(agendamento_mensagens_db_schema_1.scheduledMessages.updated_at, before)))
            .returning();
    }
    async markSent(id, at) {
        await this.db.update(agendamento_mensagens_db_schema_1.scheduledMessages)
            .set({ status: 'sent', sent_at: at, last_error: null, updated_at: at })
            .where((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.id, id));
    }
    async markFailed(id, error) {
        await this.db.update(agendamento_mensagens_db_schema_1.scheduledMessages)
            .set({ status: 'failed', last_error: error.slice(0, 500), updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(agendamento_mensagens_db_schema_1.scheduledMessages.id, id));
    }
    async contactInfo(contactId) {
        const [contact] = await this.db.select({ name: atendimento_db_schema_1.contacts.name, number: atendimento_db_schema_1.contacts.number, lid: atendimento_db_schema_1.contacts.lid })
            .from(atendimento_db_schema_1.contacts).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, contactId));
        return {
            name: contact?.name ?? null,
            target: contact?.number || (contact?.lid ? `lid:${contact.lid}` : null),
        };
    }
}
exports.DrizzleScheduledMessageRepository = DrizzleScheduledMessageRepository;
//# sourceMappingURL=agendamento-mensagens.repository.js.map