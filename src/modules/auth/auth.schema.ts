import {
    pgTable,
    uuid,
    varchar,
    boolean,
    integer,
    timestamp,
    text,
    jsonb,
} from 'drizzle-orm/pg-core';
import { profiles } from '../profiles/profile.db.schema';
import { companies } from '../companies/company.db.schema';

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    nickname: varchar('nickname', { length: 100 }),
    email: varchar('email', { length: 200 }).notNull().unique(),
    password_hash: varchar('password_hash', { length: 300 }).notNull(),
    profile_id: integer('profile_id').notNull().references(() => profiles.id),
    company_id: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    email_verified: boolean('email_verified').notNull().default(true),
    is_approved: boolean('is_approved').notNull().default(false),
    finance: boolean('finance').notNull().default(false),
    totp_secret: varchar('totp_secret', { length: 64 }),
    totp_enabled: boolean('totp_enabled').notNull().default(false),
    totp_recovery_codes: jsonb('totp_recovery_codes'),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expires_at: timestamp('expires_at').notNull(),
    created_at: timestamp('created_at').defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
