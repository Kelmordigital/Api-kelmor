import {
    pgTable, bigserial, uuid, boolean, integer, real, bigint, timestamp, varchar,
} from 'drizzle-orm/pg-core';
import { companies } from '../companies/company.db.schema';

export const companyPermissions = pgTable('company_permissions', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().unique().references(() => companies.id, { onDelete: 'cascade' }),

    // Fechamento automático
    close_open_tickets: boolean('close_open_tickets').notNull().default(false),
    close_open_tickets_interval: integer('close_open_tickets_interval').notNull().default(24),
    close_pending_tickets: boolean('close_pending_tickets').notNull().default(false),
    close_pending_tickets_interval: integer('close_pending_tickets_interval').notNull().default(48),

    // Intervalos (horas)
    interval_between_ended_message: real('interval_between_ended_message').notNull().default(6),
    interval_between_init_message: real('interval_between_init_message').notNull().default(1),
    interval_between_nps: real('interval_between_nps').notNull().default(24),

    // Pesquisa (minutos antes do envio)
    research_interval: bigint('research_interval', { mode: 'number' }).notNull().default(5),

    // Mensagens automáticas
    show_ticket_name_message: boolean('show_ticket_name_message').notNull().default(true),
    send_ticket_protocol: boolean('send_ticket_protocol').notNull().default(false),
    send_ticket_goodbye_msg: boolean('send_ticket_goodbye_msg').notNull().default(true),
    send_ticket_transfer_msg: boolean('send_ticket_transfer_msg').notNull().default(true),
    send_group_ticket_name_message: boolean('send_group_ticket_name_message').notNull().default(false),
    send_group_ticket_goodbye_msg: boolean('send_group_ticket_goodbye_msg').notNull().default(false),
    send_group_ticket_protocol: boolean('send_group_ticket_protocol').notNull().default(false),

    // Controle de acesso e fluxo
    show_all_tickets: boolean('show_all_tickets').notNull().default(false),
    restrict_user: boolean('restrict_user').notNull().default(false),
    limit_services_users: boolean('limit_services_users').notNull().default(false),
    number_limit_services_users: integer('number_limit_services_users').notNull().default(5),
    allow_close_pending_tickets: boolean('allow_close_pending_tickets').notNull().default(false),
    pullout_only_admins: boolean('pullout_only_admins').notNull().default(false),
    transfer_between_connections: boolean('transfer_between_connections').notNull().default(true),
    transfer_online_users: boolean('transfer_online_users').notNull().default(false),
    return_ticket: boolean('return_ticket').notNull().default(false),
    spy_ticket: boolean('spy_ticket').notNull().default(false),
    view_queue_independent_history: boolean('view_queue_independent_history').notNull().default(false),
    restrict_access_user_historic_tickets: boolean('restrict_access_user_historic_tickets').notNull().default(false),
    not_show_pending_ticket_without_queue: boolean('not_show_pending_ticket_without_queue').notNull().default(false),

    // Funcionalidades extras
    enable_automatic_tags: boolean('enable_automatic_tags').notNull().default(false),
    update_contact_name: boolean('update_contact_name').notNull().default(true),
    past_ticket_messages: boolean('past_ticket_messages').notNull().default(false),
    allow_delete_contact: boolean('allow_delete_contact').notNull().default(false),
    download_contacts: boolean('download_contacts').notNull().default(false),
    bot_messages_visualization: boolean('bot_messages_visualization').notNull().default(false),
    hide_name_indefinitely: boolean('hide_name_indefinitely').notNull().default(false),
    hide_send_no_goodbyemsg: boolean('hide_send_no_goodbyemsg').notNull().default(false),
    allow_show_campaign_to_commom_user: boolean('allow_show_campaign_to_commom_user').notNull().default(false),
    idle_bot_ticket: boolean('idle_bot_ticket').notNull().default(false),
    idle_bot_ticket_queue_id: bigint('idle_bot_ticket_queue_id', { mode: 'number' }),
    internal_chat: boolean('internal_chat').notNull().default(false),
    active_kanban: boolean('active_kanban').notNull().default(false),
    group_ticket: boolean('group_ticket').notNull().default(false),
    order_tickets: boolean('order_tickets').notNull().default(false),
    api_messages: boolean('api_messages').notNull().default(false),
    create_ticket_api_msg: boolean('create_ticket_api_msg').notNull().default(false),
    allow_show_name_on_chat: boolean('allow_show_name_on_chat').notNull().default(false),
    notify_by_email_connection: boolean('notify_by_email_connection').notNull().default(false),
    active_crm: boolean('active_crm').notNull().default(false),
    google_contacts_auto_sync: boolean('google_contacts_auto_sync').notNull().default(false),

    created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
});

export type CompanyPermission = typeof companyPermissions.$inferSelect;

export const companyEmailNotify = pgTable('company_email_notify', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    company_id: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    created_at: timestamp('created_at').defaultNow(),
});
