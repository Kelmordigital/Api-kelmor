import {
    pgTable, uuid, varchar, text, timestamp, boolean, integer, json,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

export const agendamentos = pgTable('at_agendamentos', {
    id:               uuid('id').primaryKey().defaultRandom(),
    company_id:       uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    created_by:       uuid('created_by').notNull(),
    lead_id:          varchar('lead_id', { length: 100 }),
    title:            varchar('title', { length: 255 }).notNull(),
    start_at:         timestamp('start_at').notNull(),
    end_at:           timestamp('end_at').notNull(),
    color:            varchar('color', { length: 20 }).notNull().default('#6366f1'),
    notes:            text('notes'),
    notify_on_create: boolean('notify_on_create').notNull().default(true),
    reminder_minutes: integer('reminder_minutes'),
    remind_at_exact:  boolean('remind_at_exact').notNull().default(false),
    notify_groups:    json('notify_groups').$type<number[]>().default([]),
    google_event_id:  varchar('google_event_id', { length: 255 }),
    created_at:       timestamp('created_at').defaultNow(),
    updated_at:       timestamp('updated_at').defaultNow(),
});

export type Agendamento    = typeof agendamentos.$inferSelect;
export type NewAgendamento = typeof agendamentos.$inferInsert;
