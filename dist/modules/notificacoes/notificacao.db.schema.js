"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifications = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
/**
 * Notificações para um usuário (sino). Genérica: cada tipo de aviso (falha de
 * mensagem agendada, integração caída...) é só um `type` com título, texto e
 * dados para a tela abrir o contexto.
 */
exports.notifications = (0, pg_core_1.pgTable)('at_notifications', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    user_id: (0, pg_core_1.uuid)('user_id').notNull().references(() => auth_schema_1.users.id, { onDelete: 'cascade' }),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(),
    title: (0, pg_core_1.varchar)('title', { length: 200 }).notNull(),
    body: (0, pg_core_1.text)('body'),
    data: (0, pg_core_1.jsonb)('data').$type(),
    read_at: (0, pg_core_1.timestamp)('read_at', { withTimezone: true }),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
    byUser: (0, pg_core_1.index)('at_notifications_user_read_idx').on(t.user_id, t.read_at),
}));
//# sourceMappingURL=notificacao.db.schema.js.map