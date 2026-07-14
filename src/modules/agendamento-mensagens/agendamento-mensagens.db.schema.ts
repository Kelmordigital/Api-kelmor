import {
    pgTable, bigserial, varchar, text, uuid, bigint, timestamp,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';
import { users } from '../auth/auth.schema';
import { tickets, contacts, connections } from '../atendimento/atendimento.db.schema';

// Agendamento de UMA mensagem para o contato de UM ticket específico (aba "Agendar mensagem"
// do chat). Independente do módulo `campanhas` (disparo em massa) — não compartilha tabela.
export const scheduledMessages = pgTable('at_scheduled_messages', {
    id:            bigserial('id', { mode: 'number' }).primaryKey(),
    company_id:    uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    ticket_id:     bigint('ticket_id', { mode: 'number' }).notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    contact_id:    bigint('contact_id', { mode: 'number' }).notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    connection_id: bigint('connection_id', { mode: 'number' }).notNull().references(() => connections.id, { onDelete: 'cascade' }),
    created_by:    uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    message:       text('message').notNull(),
    send_date:     timestamp('send_date', { withTimezone: true }).notNull(),
    // 'scheduled' | 'sent' | 'failed' | 'canceled'
    status:        varchar('status', { length: 20 }).notNull().default('scheduled'),
    sent_at:       timestamp('sent_at', { withTimezone: true }),
    last_error:    text('last_error'),
    created_at:    timestamp('created_at').defaultNow(),
    updated_at:    timestamp('updated_at').defaultNow(),
    deleted_at:    timestamp('deleted_at'),
});

export type ScheduledMessage = typeof scheduledMessages.$inferSelect;
