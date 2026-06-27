import {
    pgTable, bigserial, varchar, text, boolean, integer, uuid, bigint, timestamp, primaryKey,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';
import { connections, contacts } from '../atendimento/atendimento.db.schema';

export const campaigns = pgTable('at_campaigns', {
    id:            bigserial('id', { mode: 'number' }).primaryKey(),
    company_id:    uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    title:         varchar('title', { length: 200 }).notNull(),
    message:       text('message').notNull(),
    type:          varchar('type', { length: 50 }).notNull().default('whatsapp'),
    send_date:     timestamp('send_date', { withTimezone: true }).notNull(),
    timezone:      varchar('timezone', { length: 50 }).notNull().default('America/Sao_Paulo'),
    all_contacts:  boolean('all_contacts').notNull().default(false),
    tags:          text('tags'),
    is_running:    boolean('is_running').notNull().default(false),
    is_sending:    boolean('is_sending').notNull().default(false),
    is_paused:     boolean('is_paused').notNull().default(false),
    send_contacts: integer('send_contacts').notNull().default(0),
    created_at:    timestamp('created_at').defaultNow(),
    updated_at:    timestamp('updated_at').defaultNow(),
});

export const campaignConnections = pgTable('at_campaign_connections', {
    campaign_id:   bigint('campaign_id',   { mode: 'number' }).notNull().references(() => campaigns.id,    { onDelete: 'cascade' }),
    connection_id: bigint('connection_id', { mode: 'number' }).notNull().references(() => connections.id,  { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.campaign_id, t.connection_id] }) }));

export const campaignContacts = pgTable('at_campaign_contacts', {
    campaign_id: bigint('campaign_id', { mode: 'number' }).notNull().references(() => campaigns.id,  { onDelete: 'cascade' }),
    contact_id:  bigint('contact_id',  { mode: 'number' }).notNull().references(() => contacts.id,   { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.campaign_id, t.contact_id] }) }));

export const campaignSent = pgTable('at_campaign_sent', {
    id:          bigserial('id', { mode: 'number' }).primaryKey(),
    campaign_id: bigint('campaign_id', { mode: 'number' }).notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
    contact_id:  bigint('contact_id', { mode: 'number' }),
    number:      varchar('number', { length: 50 }),
    is_sent:     boolean('is_sent').notNull().default(false),
    sent_at:     timestamp('sent_at', { withTimezone: true }),
    error:       text('error'),
});

export const scheduledMessageTexts = pgTable('at_scheduled_message_texts', {
    id:         bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull(),
    label:      varchar('label', { length: 200 }).notNull(),
    text:       text('text'),
    type:       integer('type').notNull().default(1),
});
