"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickMessages = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.quickMessages = (0, pg_core_1.pgTable)('at_quick_messages', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    title: (0, pg_core_1.varchar)('title', { length: 255 }).notNull(),
    message: (0, pg_core_1.text)('message'),
    media_path: (0, pg_core_1.varchar)('media_path', { length: 500 }),
    media_type: (0, pg_core_1.varchar)('media_type', { length: 100 }),
    media_size: (0, pg_core_1.integer)('media_size'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
//# sourceMappingURL=quick-messages.db.schema.js.map