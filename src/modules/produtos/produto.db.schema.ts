import { pgTable, uuid, varchar, text, boolean, numeric, timestamp } from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

export const produtos = pgTable('at_produtos', {
    id:                 uuid('id').primaryKey().defaultRandom(),
    company_id:         uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    name:               varchar('name', { length: 255 }).notNull(),
    short_description:  text('short_description'),
    value_type:         varchar('value_type', { length: 20 }).notNull().default('valor_unico'),
    value:              numeric('value', { precision: 10, scale: 2 }),
    delivery_timeframe: varchar('delivery_timeframe', { length: 255 }),
    how_it_works:       text('how_it_works'),
    full_description:   text('full_description'),
    is_active:          boolean('is_active').notNull().default(true),
    created_at:         timestamp('created_at').defaultNow(),
    updated_at:         timestamp('updated_at').defaultNow(),
});

export type Produto    = typeof produtos.$inferSelect;
export type NewProduto = typeof produtos.$inferInsert;
