import {
    pgTable, bigserial, uuid, varchar, text, integer, timestamp,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

export const quickMessages = pgTable('at_quick_messages', {
    id:         bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    title:      varchar('title', { length: 255 }).notNull(),
    message:    text('message'),
    media_path: varchar('media_path', { length: 500 }),
    media_type: varchar('media_type', { length: 100 }),
    media_size: integer('media_size'),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});

export type QuickMessage    = typeof quickMessages.$inferSelect;
export type NewQuickMessage = typeof quickMessages.$inferInsert;
