import { pgTable, bigserial, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';
import { users } from '../auth/auth.schema';

/**
 * Notificações para um usuário (sino). Genérica: cada tipo de aviso (falha de
 * mensagem agendada, integração caída...) é só um `type` com título, texto e
 * dados para a tela abrir o contexto.
 */
export const notifications = pgTable('at_notifications', {
    id:         bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    user_id:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type:       varchar('type', { length: 50 }).notNull(),
    title:      varchar('title', { length: 200 }).notNull(),
    body:       text('body'),
    data:       jsonb('data').$type<Record<string, unknown>>(),
    read_at:    timestamp('read_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
    byUser: index('at_notifications_user_read_idx').on(t.user_id, t.read_at),
}));

export type Notification = typeof notifications.$inferSelect;
