"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyIntegrations = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.companyIntegrations = (0, pg_core_1.pgTable)('at_company_integrations', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    provider: (0, pg_core_1.varchar)('provider', { length: 50 }).notNull().default('google_calendar'),
    access_token: (0, pg_core_1.text)('access_token').notNull(),
    refresh_token: (0, pg_core_1.text)('refresh_token').notNull(),
    token_expiry: (0, pg_core_1.timestamp)('token_expiry'),
    google_email: (0, pg_core_1.varchar)('google_email', { length: 255 }),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
//# sourceMappingURL=integracao.db.schema.js.map