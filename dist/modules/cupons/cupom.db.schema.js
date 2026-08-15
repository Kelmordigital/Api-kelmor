"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cupons = exports.CUPOM_TYPES = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.CUPOM_TYPES = ['fixo', 'percentual', 'frete_gratis', 'brinde'];
exports.cupons = (0, pg_core_1.pgTable)('at_cupons', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    code: (0, pg_core_1.varchar)('code', { length: 50 }).notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 20 }).notNull().default('percentual'),
    value: (0, pg_core_1.numeric)('value', { precision: 10, scale: 2 }),
    gift_description: (0, pg_core_1.text)('gift_description'),
    min_sale_value: (0, pg_core_1.numeric)('min_sale_value', { precision: 10, scale: 2 }),
    is_public: (0, pg_core_1.boolean)('is_public').notNull().default(false),
    is_active: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
}, (table) => ({
    companyCodeUnique: (0, pg_core_1.unique)().on(table.company_id, table.code),
}));
//# sourceMappingURL=cupom.db.schema.js.map