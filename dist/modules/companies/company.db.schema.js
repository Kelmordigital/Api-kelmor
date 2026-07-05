"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.companies = exports.planTypeEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.planTypeEnum = (0, pg_core_1.pgEnum)('plan_type', ['boleto', 'credito']);
exports.companies = (0, pg_core_1.pgTable)('companies', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 200 }).notNull(),
    status: (0, pg_core_1.boolean)('status').notNull().default(true),
    plan_id: (0, pg_core_1.integer)('plan_id'),
    plan_type: (0, exports.planTypeEnum)('plan_type'),
    token: (0, pg_core_1.varchar)('token', { length: 200 }).unique(),
    stripe_customer_id: (0, pg_core_1.varchar)('stripe_customer_id', { length: 200 }),
    cnpj_cpf: (0, pg_core_1.varchar)('cnpj_cpf', { length: 20 }),
    whatsapp_lib: (0, pg_core_1.varchar)('whatsapp_lib', { length: 100 }),
    init_message: (0, pg_core_1.text)('init_message'),
    end_message: (0, pg_core_1.text)('end_message'),
    transfer_message: (0, pg_core_1.text)('transfer_message'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
//# sourceMappingURL=company.db.schema.js.map