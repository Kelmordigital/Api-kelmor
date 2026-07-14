import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../auth/auth.schema';

export const userAvatars = pgTable('at_user_avatars', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 500 }).notNull(),
    original_name: varchar('original_name', { length: 255 }),
    mime_type: varchar('mime_type', { length: 100 }),
    size_bytes: integer('size_bytes'),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});
