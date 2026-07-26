import {
    pgTable, bigserial, uuid, varchar, text, timestamp, bigint,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

// Uma chave ativa por empresa. Só o hash (sha256) é armazenado — a chave em
// texto puro só existe uma vez, na resposta de POST /company-api-keys/generate.
export const companyApiKeys = pgTable('company_api_keys', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().unique().references(() => companies.id, { onDelete: 'cascade' }),
    key_hash: varchar('key_hash', { length: 64 }).notNull().unique(),
    key_prefix: varchar('key_prefix', { length: 20 }).notNull(),
    created_at: timestamp('created_at').defaultNow(),
    revoked_at: timestamp('revoked_at'),
});

// Log de auditoria de todo envio via /api-messages/send, sempre gravado —
// independente do toggle create_ticket_api_msg (que só decide o `ticket_id`).
export const apiMessagesLog = pgTable('api_messages_log', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    connection_id: bigint('connection_id', { mode: 'number' }).notNull(),
    contact_id: bigint('contact_id', { mode: 'number' }),
    to_number: varchar('to_number', { length: 50 }).notNull(),
    body: text('body').notNull(),
    ticket_id: bigint('ticket_id', { mode: 'number' }),
    created_at: timestamp('created_at').defaultNow(),
});
