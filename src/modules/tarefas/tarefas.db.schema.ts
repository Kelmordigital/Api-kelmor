import {
    pgTable, uuid, varchar, text, timestamp, integer, bigint,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';
import { contacts } from '../atendimento/atendimento.db.schema';

// Quadro pessoal (Central de Tarefas): cada usuário tem suas colunas.
// kind: 'stack' = Pilha de Ação (fixa, entrada), 'done' = Concluídas (fixa, saída),
// 'custom' = colunas criadas pelo usuário (renomeáveis/excluíveis).
export const taskColumns = pgTable('at_task_columns', {
    id:         uuid('id').primaryKey().defaultRandom(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    user_id:    uuid('user_id').notNull(),
    title:      varchar('title', { length: 100 }).notNull(),
    kind:       varchar('kind', { length: 20 }).notNull().default('custom'),
    position:   integer('position').notNull().default(0),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});

export const tasks = pgTable('at_tasks', {
    id:           uuid('id').primaryKey().defaultRandom(),
    company_id:   uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    user_id:      uuid('user_id').notNull(),
    column_id:    uuid('column_id').notNull().references(() => taskColumns.id, { onDelete: 'cascade' }),
    contact_id:   bigint('contact_id', { mode: 'number' }).references(() => contacts.id, { onDelete: 'set null' }),
    titulo:       varchar('titulo', { length: 255 }).notNull(),
    descricao:    text('descricao'),
    due_date:     timestamp('due_date'),
    position:     integer('position').notNull().default(0),
    completed_at: timestamp('completed_at'),
    archived_at:  timestamp('archived_at'),
    created_at:   timestamp('created_at').defaultNow(),
    updated_at:   timestamp('updated_at').defaultNow(),
});

export type TaskColumn    = typeof taskColumns.$inferSelect;
export type NewTaskColumn = typeof taskColumns.$inferInsert;
export type Task          = typeof tasks.$inferSelect;
export type NewTask       = typeof tasks.$inferInsert;
