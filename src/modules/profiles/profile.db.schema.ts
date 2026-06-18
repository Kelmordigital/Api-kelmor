import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    tag: varchar('tag', { length: 50 }).notNull().unique(),
    created_at: timestamp('created_at').defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
