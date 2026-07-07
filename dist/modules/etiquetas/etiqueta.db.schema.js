"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactEtiquetas = exports.etiquetas = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.etiquetas = (0, pg_core_1.pgTable)('at_etiquetas', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    color: (0, pg_core_1.varchar)('color', { length: 20 }).notNull().default('#6366f1'),
    icon: (0, pg_core_1.varchar)('icon', { length: 50 }).notNull().default('tag'),
    keyword_trigger: (0, pg_core_1.text)('keyword_trigger'),
    keyword_type: (0, pg_core_1.varchar)('keyword_type', { length: 20 }).notNull().default('contains'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
// contact_id é varchar para aceitar tanto UUIDs de leads (uso original)
// quanto ids numéricos de at_contacts (nó "Adicionar Tag" do bot).
exports.contactEtiquetas = (0, pg_core_1.pgTable)('at_contact_etiquetas', {
    contact_id: (0, pg_core_1.varchar)('contact_id', { length: 64 }).notNull(),
    etiqueta_id: (0, pg_core_1.uuid)('etiqueta_id').notNull().references(() => exports.etiquetas.id, { onDelete: 'cascade' }),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
}, (t) => ({
    pk: (0, pg_core_1.primaryKey)({ columns: [t.contact_id, t.etiqueta_id] }),
}));
//# sourceMappingURL=etiqueta.db.schema.js.map