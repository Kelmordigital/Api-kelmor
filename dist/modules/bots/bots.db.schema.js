"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot_rotate_log = exports.bot_conversations = exports.bot_nodes = exports.bots = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.bots = (0, pg_core_1.pgTable)('at_bots', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    active: (0, pg_core_1.boolean)('active').default(false).notNull(),
    default_bot: (0, pg_core_1.boolean)('default_bot').default(false).notNull(),
    response_timer: (0, pg_core_1.integer)('response_timer').default(3).notNull(),
    opening_hours: (0, pg_core_1.boolean)('opening_hours').default(false).notNull(),
    offline_message: (0, pg_core_1.text)('offline_message'),
    exit_message: (0, pg_core_1.text)('exit_message'),
    send_exit_message: (0, pg_core_1.boolean)('send_exit_message').default(false).notNull(),
    timezone: (0, pg_core_1.varchar)('timezone', { length: 50 }).default('America/Sao_Paulo').notNull(),
    mon_ini: (0, pg_core_1.varchar)('mon_ini', { length: 5 }), mon_fin: (0, pg_core_1.varchar)('mon_fin', { length: 5 }),
    tue_ini: (0, pg_core_1.varchar)('tue_ini', { length: 5 }), tue_fin: (0, pg_core_1.varchar)('tue_fin', { length: 5 }),
    wed_ini: (0, pg_core_1.varchar)('wed_ini', { length: 5 }), wed_fin: (0, pg_core_1.varchar)('wed_fin', { length: 5 }),
    thu_ini: (0, pg_core_1.varchar)('thu_ini', { length: 5 }), thu_fin: (0, pg_core_1.varchar)('thu_fin', { length: 5 }),
    fri_ini: (0, pg_core_1.varchar)('fri_ini', { length: 5 }), fri_fin: (0, pg_core_1.varchar)('fri_fin', { length: 5 }),
    sat_ini: (0, pg_core_1.varchar)('sat_ini', { length: 5 }), sat_fin: (0, pg_core_1.varchar)('sat_fin', { length: 5 }),
    sun_ini: (0, pg_core_1.varchar)('sun_ini', { length: 5 }), sun_fin: (0, pg_core_1.varchar)('sun_fin', { length: 5 }),
    description: (0, pg_core_1.text)('description'),
    trigger_type: (0, pg_core_1.varchar)('trigger_type', { length: 20 }).default('welcome').notNull(),
    keywords: (0, pg_core_1.text)('keywords'),
    connection_id: (0, pg_core_1.integer)('connection_id'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    deleted_at: (0, pg_core_1.timestamp)('deleted_at'),
});
exports.bot_nodes = (0, pg_core_1.pgTable)('at_bot_nodes', {
    id: (0, pg_core_1.varchar)('id', { length: 36 }).primaryKey(), // UUID do frontend
    bot_id: (0, pg_core_1.bigint)('bot_id', { mode: 'number' }).notNull().references(() => exports.bots.id, { onDelete: 'cascade' }),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    type: (0, pg_core_1.varchar)('type', { length: 20 }).notNull(), // start|message|menu|question|transfer|end
    label: (0, pg_core_1.varchar)('label', { length: 100 }).notNull(),
    message: (0, pg_core_1.text)('message'),
    order_index: (0, pg_core_1.integer)('order_index').default(0).notNull(),
    next_node_id: (0, pg_core_1.varchar)('next_node_id', { length: 36 }),
    delay_seconds: (0, pg_core_1.integer)('delay_seconds').default(2).notNull(),
    x: (0, pg_core_1.integer)('x').default(0).notNull(),
    y: (0, pg_core_1.integer)('y').default(0).notNull(),
    node_data: (0, pg_core_1.text)('node_data'), // JSON serializado
    // Fila-alvo quando type === 'transfer' (roteamento + distribuição automática)
    queue_id: (0, pg_core_1.bigint)('queue_id', { mode: 'number' }),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
exports.bot_conversations = (0, pg_core_1.pgTable)('at_bot_conversations', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    bot_id: (0, pg_core_1.bigint)('bot_id', { mode: 'number' }).notNull().references(() => exports.bots.id, { onDelete: 'cascade' }),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    contact_phone: (0, pg_core_1.varchar)('contact_phone', { length: 30 }).notNull(),
    current_node_id: (0, pg_core_1.varchar)('current_node_id', { length: 36 }),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('active').notNull(), // active|ended|error
    context: (0, pg_core_1.text)('context'), // JSON: variáveis capturadas no fluxo ({{nome}}, etc.)
    error_message: (0, pg_core_1.text)('error_message'), // preenchido quando status='error' — exceção que travou o fluxo
    started_at: (0, pg_core_1.timestamp)('started_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
// Log do nó "Rotacionar Contato": cada lead distribuído gera uma linha.
// A posição do rodízio deriva da contagem; o relatório agrega por contato.
exports.bot_rotate_log = (0, pg_core_1.pgTable)('at_bot_rotate_log', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    bot_id: (0, pg_core_1.bigint)('bot_id', { mode: 'number' }).notNull().references(() => exports.bots.id, { onDelete: 'cascade' }),
    node_id: (0, pg_core_1.varchar)('node_id', { length: 36 }).notNull(),
    contact_name: (0, pg_core_1.varchar)('contact_name', { length: 255 }),
    contact_phone: (0, pg_core_1.varchar)('contact_phone', { length: 30 }).notNull(),
    lead_phone: (0, pg_core_1.varchar)('lead_phone', { length: 30 }),
    lead_name: (0, pg_core_1.varchar)('lead_name', { length: 255 }),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
//# sourceMappingURL=bots.db.schema.js.map