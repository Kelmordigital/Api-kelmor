"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiMessagesLog = exports.companyApiKeys = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
// Uma chave ativa por empresa. Só o hash (sha256) é armazenado — a chave em
// texto puro só existe uma vez, na resposta de POST /company-api-keys/generate.
exports.companyApiKeys = (0, pg_core_1.pgTable)('company_api_keys', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().unique().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    key_hash: (0, pg_core_1.varchar)('key_hash', { length: 64 }).notNull().unique(),
    key_prefix: (0, pg_core_1.varchar)('key_prefix', { length: 20 }).notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    revoked_at: (0, pg_core_1.timestamp)('revoked_at'),
});
// Log de auditoria de todo envio via /api-messages/send, sempre gravado —
// independente do toggle create_ticket_api_msg (que só decide o `ticket_id`).
exports.apiMessagesLog = (0, pg_core_1.pgTable)('api_messages_log', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    connection_id: (0, pg_core_1.bigint)('connection_id', { mode: 'number' }).notNull(),
    contact_id: (0, pg_core_1.bigint)('contact_id', { mode: 'number' }),
    to_number: (0, pg_core_1.varchar)('to_number', { length: 50 }).notNull(),
    body: (0, pg_core_1.text)('body').notNull(),
    ticket_id: (0, pg_core_1.bigint)('ticket_id', { mode: 'number' }),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
//# sourceMappingURL=api-messages.db.schema.js.map