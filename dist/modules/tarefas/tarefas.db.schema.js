"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tasks = exports.taskColumns = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
// Quadro pessoal (Central de Tarefas): cada usuário tem suas colunas.
// kind: 'stack' = Pilha de Ação (fixa, entrada), 'done' = Concluídas (fixa, saída),
// 'custom' = colunas criadas pelo usuário (renomeáveis/excluíveis).
exports.taskColumns = (0, pg_core_1.pgTable)('at_task_columns', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    user_id: (0, pg_core_1.uuid)('user_id').notNull(),
    title: (0, pg_core_1.varchar)('title', { length: 100 }).notNull(),
    kind: (0, pg_core_1.varchar)('kind', { length: 20 }).notNull().default('custom'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
exports.tasks = (0, pg_core_1.pgTable)('at_tasks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    user_id: (0, pg_core_1.uuid)('user_id').notNull(),
    column_id: (0, pg_core_1.uuid)('column_id').notNull().references(() => exports.taskColumns.id, { onDelete: 'cascade' }),
    contact_id: (0, pg_core_1.bigint)('contact_id', { mode: 'number' }).references(() => atendimento_db_schema_1.contacts.id, { onDelete: 'set null' }),
    titulo: (0, pg_core_1.varchar)('titulo', { length: 255 }).notNull(),
    descricao: (0, pg_core_1.text)('descricao'),
    due_date: (0, pg_core_1.timestamp)('due_date'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    completed_at: (0, pg_core_1.timestamp)('completed_at'),
    archived_at: (0, pg_core_1.timestamp)('archived_at'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
//# sourceMappingURL=tarefas.db.schema.js.map