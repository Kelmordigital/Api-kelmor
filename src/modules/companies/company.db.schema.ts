import {
    pgTable,
    pgEnum,
    uuid,
    varchar,
    boolean,
    integer,
    timestamp,
} from 'drizzle-orm/pg-core';

export const planTypeEnum = pgEnum('plan_type', ['boleto', 'credito']);

export const companies = pgTable('companies', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    status: boolean('status').notNull().default(true),
    plan_id: integer('plan_id'),
    plan_type: planTypeEnum('plan_type'),
    token: varchar('token', { length: 200 }).unique(),
    stripe_customer_id: varchar('stripe_customer_id', { length: 200 }),
    cnpj_cpf: varchar('cnpj_cpf', { length: 20 }),
    whatsapp_lib: varchar('whatsapp_lib', { length: 100 }),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});

export type Company = typeof companies.$inferSelect;
