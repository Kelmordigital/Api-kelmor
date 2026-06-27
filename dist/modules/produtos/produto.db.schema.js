"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.produtos = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.produtos = (0, pg_core_1.pgTable)('at_produtos', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    short_description: (0, pg_core_1.text)('short_description'),
    value_type: (0, pg_core_1.varchar)('value_type', { length: 20 }).notNull().default('valor_unico'),
    value: (0, pg_core_1.numeric)('value', { precision: 10, scale: 2 }),
    delivery_timeframe: (0, pg_core_1.varchar)('delivery_timeframe', { length: 255 }),
    how_it_works: (0, pg_core_1.text)('how_it_works'),
    full_description: (0, pg_core_1.text)('full_description'),
    is_active: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
//# sourceMappingURL=produto.db.schema.js.map