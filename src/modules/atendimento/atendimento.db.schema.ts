import {
    pgTable, bigserial, varchar, text, boolean,
    integer, bigint, timestamp, uuid, primaryKey, jsonb,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';
import { users } from '../auth/auth.schema';

export const statuses = pgTable('at_statuses', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    tag: varchar('tag', { length: 50 }).notNull().unique(),
    created_at: timestamp('created_at').defaultNow(),
});

export const connections = pgTable('at_connections', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    serialized_id: varchar('serialized_id', { length: 255 }),
    type: varchar('type', { length: 50 }).default('whatsapp'), // whatsapp (Baileys) | whatsapp-oficial (Cloud API)
    status: varchar('status', { length: 50 }).default('disconnected'),
    // ── API Oficial (WhatsApp Cloud API / Meta) ──────────────────────────────
    wab_connection: boolean('wab_connection').default(false),
    wab_business_id: varchar('wab_business_id', { length: 255 }),               // ID do WABA (templates)
    wab_business_phonenumber_id: varchar('wab_business_phonenumber_id', { length: 255 }), // ID do telefone (URL de envio + lookup do webhook)
    wab_business_number: varchar('wab_business_number', { length: 50 }),        // número exibível
    wab_token: text('wab_token'),                                                // Bearer token da Graph API
    wab_is_registered: boolean('wab_is_registered').default(false),
    created_at: timestamp('created_at').defaultNow(),
});

export const queues = pgTable('at_queues', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    color: varchar('color', { length: 50 }),
    enabled: boolean('enabled').default(true),
    greeting_message: text('greeting_message'),
    // Modo de distribuição automática: none | less_attendances | time | attendant
    distribution: varchar('distribution', { length: 30 }).default('none').notNull(),
    deleted_at: timestamp('deleted_at'),
});

export const contacts = pgTable('at_contacts', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    number: varchar('number', { length: 50 }),
    email: varchar('email', { length: 255 }),
    origin: varchar('origin', { length: 255 }),
    lid: varchar('lid', { length: 255 }),
    wa_username: varchar('wa_username', { length: 255 }),
    profile_pic_url: text('profile_pic_url'),
    created_at: timestamp('created_at').defaultNow(),
});

export const crm_sales_reasons = pgTable('at_crm_sales_reasons', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    color: varchar('color', { length: 50 }),
});

export const crm_keywords = pgTable('at_crm_keywords', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    keyword: varchar('keyword', { length: 255 }).notNull(),
    origin: varchar('origin', { length: 255 }).notNull(),
    created_at: timestamp('created_at').defaultNow(),
});

// Nota manual na timeline de interações do lead (painel do CRM). Sem
// updated_at/deleted_at — registro de histórico imutável, mesmo espírito do
// "atendimento fechado é definitivo". Visível pra qualquer usuário da empresa
// que abrir o contato, não só pra quem escreveu.
export const crm_contact_notes = pgTable('crm_contact_notes', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    contact_id: bigint('contact_id', { mode: 'number' }).notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    created_at: timestamp('created_at').defaultNow(),
});

export const tickets = pgTable('at_tickets', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    connection_id: bigint('connection_id', { mode: 'number' }),
    contact_id: bigint('contact_id', { mode: 'number' }).notNull(),
    queue_id: bigint('queue_id', { mode: 'number' }),
    status_id: bigint('status_id', { mode: 'number' }).notNull().default(1),
    attendant_user_id: uuid('attendant_user_id').references(() => users.id, { onDelete: 'set null' }),
    closed_by_user_id: uuid('closed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    serialized_id: varchar('serialized_id', { length: 255 }),
    origin: varchar('origin', { length: 255 }),
    type: varchar('type', { length: 50 }).default('whatsapp'),
    ocurrence: varchar('ocurrence', { length: 500 }),
    is_sale: integer('is_sale'),
    sale_price: varchar('sale_price', { length: 100 }).default('0,00'),
    reasons_id: bigint('reasons_id', { mode: 'number' }),
    loss_product_name: varchar('loss_product_name', { length: 255 }),
    service_not_made: integer('service_not_made').default(0),
    pinned: integer('pinned').default(0),        // 1 = fixado no topo
    is_transfer: integer('is_transfer').default(0), // 1 = foi transferido
    funil_stage: varchar('funil_stage', { length: 50 }).notNull().default('novos_leads'),
    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
    deleted_at: timestamp('deleted_at'),
});

export const atendimento_messages = pgTable('at_messages', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticket_id: bigint('ticket_id', { mode: 'number' }).notNull(),
    contact_id: bigint('contact_id', { mode: 'number' }),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body'),
    from_me: boolean('from_me').default(false),
    media_type: varchar('media_type', { length: 100 }),
    media_url: text('media_url'),
    media_waveform: jsonb('media_waveform').$type<number[]>(),
    media_seconds: integer('media_seconds'),
    ack: integer('ack').default(0),
    wab_message_id: varchar('wab_message_id', { length: 255 }), // wamid da Cloud API (casa os status/ACK)
    created_at: timestamp('created_at').defaultNow(),
});

export const historic_tickets = pgTable('at_historic_tickets', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ticket_id: bigint('ticket_id', { mode: 'number' }).notNull(),
    user_id: uuid('user_id'),
    status_id_init: bigint('status_id_init', { mode: 'number' }),
    status_id_end: bigint('status_id_end', { mode: 'number' }),
    created_at: timestamp('created_at').defaultNow(),
});

// Log de auditoria: sempre que alguém que NÃO é o atendente do ticket visualiza
// as mensagens dele (toggle "Permitir pré-visualização do ticket" / spy_ticket).
// Gravado independente de ser admin (bypassa a permissão) ou atendente comum
// (precisa da permissão ligada) — "quem espiou o quê" importa nos dois casos.
export const ticket_spy_log = pgTable('at_ticket_spy_log', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    ticket_id: bigint('ticket_id', { mode: 'number' }).notNull(),
    user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at').defaultNow(),
});

// ── Saúde das conexões WhatsApp ───────────────────────────────────────────────
export const connection_health = pgTable('at_connection_health', {
    connection_id:        bigint('connection_id', { mode: 'number' }).primaryKey().references(() => connections.id, { onDelete: 'cascade' }),
    disconnect_count_24h: integer('disconnect_count_24h').default(0).notNull(),
    consecutive_401s:     integer('consecutive_401s').default(0).notNull(),
    last_401_at:          timestamp('last_401_at'),
    last_connected_at:    timestamp('last_connected_at'),
    status:               varchar('status', { length: 20 }).default('healthy').notNull(),
    // healthy | degraded | needs_reauth | banned_suspect
    updated_at:           timestamp('updated_at').defaultNow().notNull(),
});

// ── Log de erros de conexão WhatsApp ─────────────────────────────────────────
export const connection_errors_log = pgTable('at_connection_errors', {
    id:             bigserial('id', { mode: 'number' }).primaryKey(),
    connection_id:  bigint('connection_id', { mode: 'number' }).notNull(),
    error_type:     varchar('error_type', { length: 100 }),    // 'disconnect' | 'connect_fail' | 'qr_timeout' | etc.
    error_code:     integer('error_code'),                      // código HTTP do WhatsApp (401, 408, 503, etc.)
    error_message:  text('error_message'),
    complete_error: text('complete_error'),                     // JSON do payload completo
    created_at:     timestamp('created_at').defaultNow(),
});

export type Status = typeof statuses.$inferSelect;
export type Connection = typeof connections.$inferSelect;
export type Queue = typeof queues.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type CrmSalesReason = typeof crm_sales_reasons.$inferSelect;
export type CrmKeyword = typeof crm_keywords.$inferSelect;
export type CrmContactNote = typeof crm_contact_notes.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type AtMessage = typeof atendimento_messages.$inferSelect;
export type HistoricTicket = typeof historic_tickets.$inferSelect;
export type ConnectionError = typeof connection_errors_log.$inferSelect;
export type ConnectionHealth = typeof connection_health.$inferSelect;

// ── Associações usuário ↔ fila / conexão ─────────────────────────────────────
export const userQueues = pgTable('at_user_queues', {
    user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    queue_id: bigint('queue_id', { mode: 'number' }).notNull().references(() => queues.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.user_id, t.queue_id] }) }));

export const userConnections = pgTable('at_user_connections', {
    user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    connection_id: bigint('connection_id', { mode: 'number' }).notNull().references(() => connections.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.user_id, t.connection_id] }) }));

// ── Filas oferecidas por uma conexão (config, sem efeito em roteamento ainda) ─
export const connectionQueues = pgTable('at_connection_queues', {
    connection_id: bigint('connection_id', { mode: 'number' }).notNull().references(() => connections.id, { onDelete: 'cascade' }),
    queue_id: bigint('queue_id', { mode: 'number' }).notNull().references(() => queues.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.connection_id, t.queue_id] }) }));
