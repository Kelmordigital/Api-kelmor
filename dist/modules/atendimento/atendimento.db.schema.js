"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userConnections = exports.userQueues = exports.connection_errors_log = exports.connection_health = exports.historic_tickets = exports.atendimento_messages = exports.tickets = exports.crm_sales_reasons = exports.contacts = exports.queues = exports.connections = exports.statuses = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
exports.statuses = (0, pg_core_1.pgTable)('at_statuses', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    tag: (0, pg_core_1.varchar)('tag', { length: 50 }).notNull().unique(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
exports.connections = (0, pg_core_1.pgTable)('at_connections', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    serialized_id: (0, pg_core_1.varchar)('serialized_id', { length: 255 }),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).default('whatsapp'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('disconnected'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
exports.queues = (0, pg_core_1.pgTable)('at_queues', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    color: (0, pg_core_1.varchar)('color', { length: 50 }),
    enabled: (0, pg_core_1.boolean)('enabled').default(true),
    greeting_message: (0, pg_core_1.text)('greeting_message'),
    // Modo de distribuição automática: none | less_attendances | time | attendant
    distribution: (0, pg_core_1.varchar)('distribution', { length: 30 }).default('none').notNull(),
    deleted_at: (0, pg_core_1.timestamp)('deleted_at'),
});
exports.contacts = (0, pg_core_1.pgTable)('at_contacts', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    number: (0, pg_core_1.varchar)('number', { length: 50 }),
    email: (0, pg_core_1.varchar)('email', { length: 255 }),
    origin: (0, pg_core_1.varchar)('origin', { length: 255 }),
    lid: (0, pg_core_1.varchar)('lid', { length: 255 }),
    wa_username: (0, pg_core_1.varchar)('wa_username', { length: 255 }),
    profile_pic_url: (0, pg_core_1.text)('profile_pic_url'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
exports.crm_sales_reasons = (0, pg_core_1.pgTable)('at_crm_sales_reasons', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    reason: (0, pg_core_1.text)('reason').notNull(),
    color: (0, pg_core_1.varchar)('color', { length: 50 }),
});
exports.tickets = (0, pg_core_1.pgTable)('at_tickets', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    connection_id: (0, pg_core_1.bigint)('connection_id', { mode: 'number' }),
    contact_id: (0, pg_core_1.bigint)('contact_id', { mode: 'number' }).notNull(),
    queue_id: (0, pg_core_1.bigint)('queue_id', { mode: 'number' }),
    status_id: (0, pg_core_1.bigint)('status_id', { mode: 'number' }).notNull().default(1),
    attendant_user_id: (0, pg_core_1.uuid)('attendant_user_id').references(() => auth_schema_1.users.id, { onDelete: 'set null' }),
    closed_by_user_id: (0, pg_core_1.uuid)('closed_by_user_id').references(() => auth_schema_1.users.id, { onDelete: 'set null' }),
    serialized_id: (0, pg_core_1.varchar)('serialized_id', { length: 255 }),
    origin: (0, pg_core_1.varchar)('origin', { length: 255 }),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).default('whatsapp'),
    ocurrence: (0, pg_core_1.varchar)('ocurrence', { length: 500 }),
    is_sale: (0, pg_core_1.integer)('is_sale'),
    sale_price: (0, pg_core_1.varchar)('sale_price', { length: 100 }).default('0,00'),
    reasons_id: (0, pg_core_1.bigint)('reasons_id', { mode: 'number' }),
    loss_product_name: (0, pg_core_1.varchar)('loss_product_name', { length: 255 }),
    service_not_made: (0, pg_core_1.integer)('service_not_made').default(0),
    pinned: (0, pg_core_1.integer)('pinned').default(0), // 1 = fixado no topo
    is_transfer: (0, pg_core_1.integer)('is_transfer').default(0), // 1 = foi transferido
    funil_stage: (0, pg_core_1.varchar)('funil_stage', { length: 50 }).notNull().default('novos_leads'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
    deleted_at: (0, pg_core_1.timestamp)('deleted_at'),
});
exports.atendimento_messages = (0, pg_core_1.pgTable)('at_messages', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    ticket_id: (0, pg_core_1.bigint)('ticket_id', { mode: 'number' }).notNull(),
    contact_id: (0, pg_core_1.bigint)('contact_id', { mode: 'number' }),
    user_id: (0, pg_core_1.uuid)('user_id').references(() => auth_schema_1.users.id, { onDelete: 'set null' }),
    body: (0, pg_core_1.text)('body'),
    from_me: (0, pg_core_1.boolean)('from_me').default(false),
    media_type: (0, pg_core_1.varchar)('media_type', { length: 100 }),
    media_url: (0, pg_core_1.text)('media_url'),
    ack: (0, pg_core_1.integer)('ack').default(0),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
exports.historic_tickets = (0, pg_core_1.pgTable)('at_historic_tickets', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    ticket_id: (0, pg_core_1.bigint)('ticket_id', { mode: 'number' }).notNull(),
    user_id: (0, pg_core_1.uuid)('user_id'),
    status_id_init: (0, pg_core_1.bigint)('status_id_init', { mode: 'number' }),
    status_id_end: (0, pg_core_1.bigint)('status_id_end', { mode: 'number' }),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
// ── Saúde das conexões WhatsApp ───────────────────────────────────────────────
exports.connection_health = (0, pg_core_1.pgTable)('at_connection_health', {
    connection_id: (0, pg_core_1.bigint)('connection_id', { mode: 'number' }).primaryKey().references(() => exports.connections.id, { onDelete: 'cascade' }),
    disconnect_count_24h: (0, pg_core_1.integer)('disconnect_count_24h').default(0).notNull(),
    consecutive_401s: (0, pg_core_1.integer)('consecutive_401s').default(0).notNull(),
    last_401_at: (0, pg_core_1.timestamp)('last_401_at'),
    last_connected_at: (0, pg_core_1.timestamp)('last_connected_at'),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('healthy').notNull(),
    // healthy | degraded | needs_reauth | banned_suspect
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
// ── Log de erros de conexão WhatsApp ─────────────────────────────────────────
exports.connection_errors_log = (0, pg_core_1.pgTable)('at_connection_errors', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    connection_id: (0, pg_core_1.bigint)('connection_id', { mode: 'number' }).notNull(),
    error_type: (0, pg_core_1.varchar)('error_type', { length: 100 }), // 'disconnect' | 'connect_fail' | 'qr_timeout' | etc.
    error_code: (0, pg_core_1.integer)('error_code'), // código HTTP do WhatsApp (401, 408, 503, etc.)
    error_message: (0, pg_core_1.text)('error_message'),
    complete_error: (0, pg_core_1.text)('complete_error'), // JSON do payload completo
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
// ── Associações usuário ↔ fila / conexão ─────────────────────────────────────
exports.userQueues = (0, pg_core_1.pgTable)('at_user_queues', {
    user_id: (0, pg_core_1.uuid)('user_id').notNull().references(() => auth_schema_1.users.id, { onDelete: 'cascade' }),
    queue_id: (0, pg_core_1.bigint)('queue_id', { mode: 'number' }).notNull().references(() => exports.queues.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: (0, pg_core_1.primaryKey)({ columns: [t.user_id, t.queue_id] }) }));
exports.userConnections = (0, pg_core_1.pgTable)('at_user_connections', {
    user_id: (0, pg_core_1.uuid)('user_id').notNull().references(() => auth_schema_1.users.id, { onDelete: 'cascade' }),
    connection_id: (0, pg_core_1.bigint)('connection_id', { mode: 'number' }).notNull().references(() => exports.connections.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: (0, pg_core_1.primaryKey)({ columns: [t.user_id, t.connection_id] }) }));
//# sourceMappingURL=atendimento.db.schema.js.map