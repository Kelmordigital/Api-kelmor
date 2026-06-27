import {
    pgTable, bigserial, bigint, varchar, text, boolean, timestamp, uuid, primaryKey,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';
import { queues } from '../atendimento/atendimento.db.schema';

export const researchs = pgTable('at_researchs', {
    id:               bigserial('id', { mode: 'number' }).primaryKey(),
    company_id:       uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    name:             text('name').notNull(),
    type:             varchar('type', { length: 50 }).notNull().default('satisfaction'),
    active:           boolean('active').notNull().default(true),
    default_research: boolean('default_research').notNull().default(false),
    created_at:       timestamp('created_at').defaultNow(),
    updated_at:       timestamp('updated_at').defaultNow(),
});

export const researchAnswers = pgTable('at_research_answers', {
    id:          bigserial('id', { mode: 'number' }).primaryKey(),
    research_id: bigint('research_id', { mode: 'number' }).notNull().references(() => researchs.id, { onDelete: 'cascade' }),
    title:       varchar('title', { length: 200 }).notNull(),
    created_at:  timestamp('created_at').defaultNow(),
});

export const queueResearchs = pgTable('at_queue_researchs', {
    research_id: bigint('research_id', { mode: 'number' }).notNull().references(() => researchs.id, { onDelete: 'cascade' }),
    queue_id:    bigint('queue_id', { mode: 'number' }).notNull().references(() => queues.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.research_id, t.queue_id] }) }));

export type Research       = typeof researchs.$inferSelect;
export type ResearchAnswer = typeof researchAnswers.$inferSelect;
