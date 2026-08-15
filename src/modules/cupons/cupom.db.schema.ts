import {
    pgTable, uuid, varchar, text, boolean, numeric, timestamp, unique,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

export const CUPOM_TYPES = ['fixo', 'percentual', 'frete_gratis', 'brinde'] as const;
export type CupomType = typeof CUPOM_TYPES[number];

export const cupons = pgTable('at_cupons', {
    id:                uuid('id').primaryKey().defaultRandom(),
    company_id:        uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    code:              varchar('code', { length: 50 }).notNull(),
    type:              varchar('type', { length: 20 }).notNull().default('percentual'),
    value:             numeric('value', { precision: 10, scale: 2 }),
    gift_description:  text('gift_description'),
    min_sale_value:    numeric('min_sale_value', { precision: 10, scale: 2 }),
    is_public:         boolean('is_public').notNull().default(false),
    is_active:         boolean('is_active').notNull().default(true),
    created_at:        timestamp('created_at').defaultNow(),
    updated_at:        timestamp('updated_at').defaultNow(),
}, (table) => ({
    companyCodeUnique: unique().on(table.company_id, table.code),
}));

export type Cupom    = typeof cupons.$inferSelect;
export type NewCupom = typeof cupons.$inferInsert;
