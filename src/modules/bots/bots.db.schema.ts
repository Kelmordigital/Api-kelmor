import {
    pgTable, bigserial, bigint, varchar, text, boolean,
    integer, timestamp, uuid,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

export const bots = pgTable('at_bots', {
    id:               bigserial('id', { mode: 'number' }).primaryKey(),
    company_id:       uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    name:             varchar('name', { length: 100 }).notNull(),
    active:           boolean('active').default(false).notNull(),
    default_bot:      boolean('default_bot').default(false).notNull(),
    response_timer:   integer('response_timer').default(3).notNull(),
    opening_hours:    boolean('opening_hours').default(false).notNull(),
    offline_message:  text('offline_message'),
    exit_message:     text('exit_message'),
    send_exit_message: boolean('send_exit_message').default(false).notNull(),
    timezone:         varchar('timezone', { length: 50 }).default('America/Sao_Paulo').notNull(),
    mon_ini: varchar('mon_ini', { length: 5 }), mon_fin: varchar('mon_fin', { length: 5 }),
    tue_ini: varchar('tue_ini', { length: 5 }), tue_fin: varchar('tue_fin', { length: 5 }),
    wed_ini: varchar('wed_ini', { length: 5 }), wed_fin: varchar('wed_fin', { length: 5 }),
    thu_ini: varchar('thu_ini', { length: 5 }), thu_fin: varchar('thu_fin', { length: 5 }),
    fri_ini: varchar('fri_ini', { length: 5 }), fri_fin: varchar('fri_fin', { length: 5 }),
    sat_ini: varchar('sat_ini', { length: 5 }), sat_fin: varchar('sat_fin', { length: 5 }),
    sun_ini: varchar('sun_ini', { length: 5 }), sun_fin: varchar('sun_fin', { length: 5 }),
    description:   text('description'),
    trigger_type:  varchar('trigger_type', { length: 20 }).default('welcome').notNull(),
    keywords:      text('keywords'),
    connection_id: integer('connection_id'),
    created_at:  timestamp('created_at').defaultNow(),
    deleted_at:  timestamp('deleted_at'),
});

export const bot_nodes = pgTable('at_bot_nodes', {
    id:           varchar('id', { length: 36 }).primaryKey(), // UUID do frontend
    bot_id:       bigint('bot_id', { mode: 'number' }).notNull().references(() => bots.id, { onDelete: 'cascade' }),
    company_id:   uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    type:         varchar('type', { length: 20 }).notNull(), // start|message|menu|question|transfer|end
    label:        varchar('label', { length: 100 }).notNull(),
    message:      text('message'),
    order_index:  integer('order_index').default(0).notNull(),
    next_node_id: varchar('next_node_id', { length: 36 }),
    delay_seconds: integer('delay_seconds').default(2).notNull(),
    x:            integer('x').default(0).notNull(),
    y:            integer('y').default(0).notNull(),
    node_data:    text('node_data'), // JSON serializado
    // Fila-alvo quando type === 'transfer' (roteamento + distribuição automática)
    queue_id:     bigint('queue_id', { mode: 'number' }),
    created_at:   timestamp('created_at').defaultNow(),
});

export const bot_conversations = pgTable('at_bot_conversations', {
    id:              bigserial('id', { mode: 'number' }).primaryKey(),
    bot_id:          bigint('bot_id', { mode: 'number' }).notNull().references(() => bots.id, { onDelete: 'cascade' }),
    company_id:      uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    contact_phone:   varchar('contact_phone', { length: 30 }).notNull(),
    current_node_id: varchar('current_node_id', { length: 36 }),
    status:          varchar('status', { length: 20 }).default('active').notNull(), // active|ended
    context:         text('context'), // JSON: variáveis capturadas no fluxo ({{nome}}, etc.)
    started_at:      timestamp('started_at').defaultNow(),
    updated_at:      timestamp('updated_at').defaultNow(),
});

// Log do nó "Rotacionar Contato": cada lead distribuído gera uma linha.
// A posição do rodízio deriva da contagem; o relatório agrega por contato.
export const bot_rotate_log = pgTable('at_bot_rotate_log', {
    id:            bigserial('id', { mode: 'number' }).primaryKey(),
    company_id:    uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    bot_id:        bigint('bot_id', { mode: 'number' }).notNull().references(() => bots.id, { onDelete: 'cascade' }),
    node_id:       varchar('node_id', { length: 36 }).notNull(),
    contact_name:  varchar('contact_name', { length: 255 }),
    contact_phone: varchar('contact_phone', { length: 30 }).notNull(),
    lead_phone:    varchar('lead_phone', { length: 30 }),
    lead_name:     varchar('lead_name', { length: 255 }),
    created_at:    timestamp('created_at').defaultNow(),
});

export type Bot             = typeof bots.$inferSelect;
export type NewBot          = typeof bots.$inferInsert;
export type BotNode         = typeof bot_nodes.$inferSelect;
export type NewBotNode      = typeof bot_nodes.$inferInsert;
export type BotConversation = typeof bot_conversations.$inferSelect;
export type BotRotateLog    = typeof bot_rotate_log.$inferSelect;
