"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledMessageTexts = exports.campaignSent = exports.campaignContacts = exports.campaignConnections = exports.campaigns = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
exports.campaigns = (0, pg_core_1.pgTable)('at_campaigns', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    title: (0, pg_core_1.varchar)('title', { length: 200 }).notNull(),
    message: (0, pg_core_1.text)('message').notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull().default('whatsapp'),
    send_date: (0, pg_core_1.timestamp)('send_date', { withTimezone: true }).notNull(),
    timezone: (0, pg_core_1.varchar)('timezone', { length: 50 }).notNull().default('America/Sao_Paulo'),
    all_contacts: (0, pg_core_1.boolean)('all_contacts').notNull().default(false),
    tags: (0, pg_core_1.text)('tags'),
    is_running: (0, pg_core_1.boolean)('is_running').notNull().default(false),
    is_sending: (0, pg_core_1.boolean)('is_sending').notNull().default(false),
    is_paused: (0, pg_core_1.boolean)('is_paused').notNull().default(false),
    send_contacts: (0, pg_core_1.integer)('send_contacts').notNull().default(0),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
exports.campaignConnections = (0, pg_core_1.pgTable)('at_campaign_connections', {
    campaign_id: (0, pg_core_1.bigint)('campaign_id', { mode: 'number' }).notNull().references(() => exports.campaigns.id, { onDelete: 'cascade' }),
    connection_id: (0, pg_core_1.bigint)('connection_id', { mode: 'number' }).notNull().references(() => atendimento_db_schema_1.connections.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: (0, pg_core_1.primaryKey)({ columns: [t.campaign_id, t.connection_id] }) }));
exports.campaignContacts = (0, pg_core_1.pgTable)('at_campaign_contacts', {
    campaign_id: (0, pg_core_1.bigint)('campaign_id', { mode: 'number' }).notNull().references(() => exports.campaigns.id, { onDelete: 'cascade' }),
    contact_id: (0, pg_core_1.bigint)('contact_id', { mode: 'number' }).notNull().references(() => atendimento_db_schema_1.contacts.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: (0, pg_core_1.primaryKey)({ columns: [t.campaign_id, t.contact_id] }) }));
exports.campaignSent = (0, pg_core_1.pgTable)('at_campaign_sent', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    campaign_id: (0, pg_core_1.bigint)('campaign_id', { mode: 'number' }).notNull().references(() => exports.campaigns.id, { onDelete: 'cascade' }),
    contact_id: (0, pg_core_1.bigint)('contact_id', { mode: 'number' }),
    number: (0, pg_core_1.varchar)('number', { length: 50 }),
    is_sent: (0, pg_core_1.boolean)('is_sent').notNull().default(false),
    sent_at: (0, pg_core_1.timestamp)('sent_at', { withTimezone: true }),
    error: (0, pg_core_1.text)('error'),
});
exports.scheduledMessageTexts = (0, pg_core_1.pgTable)('at_scheduled_message_texts', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull(),
    label: (0, pg_core_1.varchar)('label', { length: 200 }).notNull(),
    text: (0, pg_core_1.text)('text'),
    type: (0, pg_core_1.integer)('type').notNull().default(1),
});
//# sourceMappingURL=campanha.db.schema.js.map