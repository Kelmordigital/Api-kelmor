"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendamentos = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.agendamentos = (0, pg_core_1.pgTable)('at_agendamentos', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    created_by: (0, pg_core_1.uuid)('created_by').notNull(),
    lead_id: (0, pg_core_1.varchar)('lead_id', { length: 100 }),
    title: (0, pg_core_1.varchar)('title', { length: 255 }).notNull(),
    start_at: (0, pg_core_1.timestamp)('start_at').notNull(),
    end_at: (0, pg_core_1.timestamp)('end_at').notNull(),
    color: (0, pg_core_1.varchar)('color', { length: 20 }).notNull().default('#6366f1'),
    notes: (0, pg_core_1.text)('notes'),
    notify_on_create: (0, pg_core_1.boolean)('notify_on_create').notNull().default(true),
    reminder_minutes: (0, pg_core_1.integer)('reminder_minutes'),
    remind_at_exact: (0, pg_core_1.boolean)('remind_at_exact').notNull().default(false),
    notify_groups: (0, pg_core_1.json)('notify_groups').$type().default([]),
    google_event_id: (0, pg_core_1.varchar)('google_event_id', { length: 255 }),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
//# sourceMappingURL=agenda.db.schema.js.map