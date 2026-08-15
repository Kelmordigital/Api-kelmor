"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledMessages = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
// Agendamento de UMA mensagem para o contato de UM ticket específico (aba "Agendar mensagem"
// do chat). Independente do módulo `campanhas` (disparo em massa) — não compartilha tabela.
exports.scheduledMessages = (0, pg_core_1.pgTable)('at_scheduled_messages', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    ticket_id: (0, pg_core_1.bigint)('ticket_id', { mode: 'number' }).notNull().references(() => atendimento_db_schema_1.tickets.id, { onDelete: 'cascade' }),
    contact_id: (0, pg_core_1.bigint)('contact_id', { mode: 'number' }).notNull().references(() => atendimento_db_schema_1.contacts.id, { onDelete: 'cascade' }),
    connection_id: (0, pg_core_1.bigint)('connection_id', { mode: 'number' }).notNull().references(() => atendimento_db_schema_1.connections.id, { onDelete: 'cascade' }),
    created_by: (0, pg_core_1.uuid)('created_by').references(() => auth_schema_1.users.id, { onDelete: 'set null' }),
    message: (0, pg_core_1.text)('message').notNull(),
    send_date: (0, pg_core_1.timestamp)('send_date', { withTimezone: true }).notNull(),
    // 'scheduled' | 'sent' | 'failed' | 'canceled'
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull().default('scheduled'),
    sent_at: (0, pg_core_1.timestamp)('sent_at', { withTimezone: true }),
    last_error: (0, pg_core_1.text)('last_error'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
    deleted_at: (0, pg_core_1.timestamp)('deleted_at'),
});
//# sourceMappingURL=agendamento-mensagens.db.schema.js.map