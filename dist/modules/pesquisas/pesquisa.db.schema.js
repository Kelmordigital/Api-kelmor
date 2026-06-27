"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueResearchs = exports.researchAnswers = exports.researchs = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
exports.researchs = (0, pg_core_1.pgTable)('at_researchs', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull().default('satisfaction'),
    active: (0, pg_core_1.boolean)('active').notNull().default(true),
    default_research: (0, pg_core_1.boolean)('default_research').notNull().default(false),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
exports.researchAnswers = (0, pg_core_1.pgTable)('at_research_answers', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    research_id: (0, pg_core_1.bigint)('research_id', { mode: 'number' }).notNull().references(() => exports.researchs.id, { onDelete: 'cascade' }),
    title: (0, pg_core_1.varchar)('title', { length: 200 }).notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
exports.queueResearchs = (0, pg_core_1.pgTable)('at_queue_researchs', {
    research_id: (0, pg_core_1.bigint)('research_id', { mode: 'number' }).notNull().references(() => exports.researchs.id, { onDelete: 'cascade' }),
    queue_id: (0, pg_core_1.bigint)('queue_id', { mode: 'number' }).notNull().references(() => atendimento_db_schema_1.queues.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: (0, pg_core_1.primaryKey)({ columns: [t.research_id, t.queue_id] }) }));
//# sourceMappingURL=pesquisa.db.schema.js.map