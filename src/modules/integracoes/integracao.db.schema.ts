import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

export const companyIntegrations = pgTable('at_company_integrations', {
    id:            uuid('id').primaryKey().defaultRandom(),
    company_id:    uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    provider:      varchar('provider', { length: 50 }).notNull().default('google_calendar'),
    access_token:  text('access_token').notNull(),
    refresh_token: text('refresh_token').notNull(),
    token_expiry:  timestamp('token_expiry'),
    google_email:  varchar('google_email', { length: 255 }),
    created_at:    timestamp('created_at').defaultNow(),
    updated_at:    timestamp('updated_at').defaultNow(),
});

export type CompanyIntegration    = typeof companyIntegrations.$inferSelect;
export type NewCompanyIntegration = typeof companyIntegrations.$inferInsert;
