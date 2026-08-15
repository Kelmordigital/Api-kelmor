"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyEmailNotify = exports.companyPermissions = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.companyPermissions = (0, pg_core_1.pgTable)('company_permissions', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().unique().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    // Fechamento automático
    close_open_tickets: (0, pg_core_1.boolean)('close_open_tickets').notNull().default(false),
    close_open_tickets_interval: (0, pg_core_1.integer)('close_open_tickets_interval').notNull().default(24),
    close_pending_tickets: (0, pg_core_1.boolean)('close_pending_tickets').notNull().default(false),
    close_pending_tickets_interval: (0, pg_core_1.integer)('close_pending_tickets_interval').notNull().default(48),
    // Intervalos (horas)
    interval_between_ended_message: (0, pg_core_1.real)('interval_between_ended_message').notNull().default(6),
    interval_between_init_message: (0, pg_core_1.real)('interval_between_init_message').notNull().default(1),
    interval_between_nps: (0, pg_core_1.real)('interval_between_nps').notNull().default(24),
    // Pesquisa (minutos antes do envio)
    research_interval: (0, pg_core_1.bigint)('research_interval', { mode: 'number' }).notNull().default(5),
    // Mensagens automáticas
    show_ticket_name_message: (0, pg_core_1.boolean)('show_ticket_name_message').notNull().default(true),
    send_ticket_protocol: (0, pg_core_1.boolean)('send_ticket_protocol').notNull().default(false),
    send_ticket_goodbye_msg: (0, pg_core_1.boolean)('send_ticket_goodbye_msg').notNull().default(true),
    send_ticket_transfer_msg: (0, pg_core_1.boolean)('send_ticket_transfer_msg').notNull().default(true),
    send_group_ticket_name_message: (0, pg_core_1.boolean)('send_group_ticket_name_message').notNull().default(false),
    send_group_ticket_goodbye_msg: (0, pg_core_1.boolean)('send_group_ticket_goodbye_msg').notNull().default(false),
    send_group_ticket_protocol: (0, pg_core_1.boolean)('send_group_ticket_protocol').notNull().default(false),
    // Controle de acesso e fluxo
    show_all_tickets: (0, pg_core_1.boolean)('show_all_tickets').notNull().default(false),
    restrict_user: (0, pg_core_1.boolean)('restrict_user').notNull().default(false),
    limit_services_users: (0, pg_core_1.boolean)('limit_services_users').notNull().default(false),
    number_limit_services_users: (0, pg_core_1.integer)('number_limit_services_users').notNull().default(5),
    allow_close_pending_tickets: (0, pg_core_1.boolean)('allow_close_pending_tickets').notNull().default(false),
    pullout_only_admins: (0, pg_core_1.boolean)('pullout_only_admins').notNull().default(false),
    transfer_between_connections: (0, pg_core_1.boolean)('transfer_between_connections').notNull().default(true),
    transfer_online_users: (0, pg_core_1.boolean)('transfer_online_users').notNull().default(false),
    return_ticket: (0, pg_core_1.boolean)('return_ticket').notNull().default(false),
    spy_ticket: (0, pg_core_1.boolean)('spy_ticket').notNull().default(false),
    view_queue_independent_history: (0, pg_core_1.boolean)('view_queue_independent_history').notNull().default(false),
    restrict_access_user_historic_tickets: (0, pg_core_1.boolean)('restrict_access_user_historic_tickets').notNull().default(false),
    not_show_pending_ticket_without_queue: (0, pg_core_1.boolean)('not_show_pending_ticket_without_queue').notNull().default(false),
    // Funcionalidades extras
    enable_automatic_tags: (0, pg_core_1.boolean)('enable_automatic_tags').notNull().default(false),
    update_contact_name: (0, pg_core_1.boolean)('update_contact_name').notNull().default(true),
    past_ticket_messages: (0, pg_core_1.boolean)('past_ticket_messages').notNull().default(false),
    allow_delete_contact: (0, pg_core_1.boolean)('allow_delete_contact').notNull().default(false),
    download_contacts: (0, pg_core_1.boolean)('download_contacts').notNull().default(false),
    bot_messages_visualization: (0, pg_core_1.boolean)('bot_messages_visualization').notNull().default(false),
    hide_name_indefinitely: (0, pg_core_1.boolean)('hide_name_indefinitely').notNull().default(false),
    hide_send_no_goodbyemsg: (0, pg_core_1.boolean)('hide_send_no_goodbyemsg').notNull().default(false),
    allow_show_campaign_to_commom_user: (0, pg_core_1.boolean)('allow_show_campaign_to_commom_user').notNull().default(false),
    idle_bot_ticket: (0, pg_core_1.boolean)('idle_bot_ticket').notNull().default(false),
    idle_bot_ticket_queue_id: (0, pg_core_1.bigint)('idle_bot_ticket_queue_id', { mode: 'number' }),
    internal_chat: (0, pg_core_1.boolean)('internal_chat').notNull().default(false),
    active_kanban: (0, pg_core_1.boolean)('active_kanban').notNull().default(false),
    group_ticket: (0, pg_core_1.boolean)('group_ticket').notNull().default(false),
    order_tickets: (0, pg_core_1.boolean)('order_tickets').notNull().default(false),
    api_messages: (0, pg_core_1.boolean)('api_messages').notNull().default(false),
    create_ticket_api_msg: (0, pg_core_1.boolean)('create_ticket_api_msg').notNull().default(false),
    allow_show_name_on_chat: (0, pg_core_1.boolean)('allow_show_name_on_chat').notNull().default(false),
    notify_by_email_connection: (0, pg_core_1.boolean)('notify_by_email_connection').notNull().default(false),
    active_crm: (0, pg_core_1.boolean)('active_crm').notNull().default(false),
    google_contacts_auto_sync: (0, pg_core_1.boolean)('google_contacts_auto_sync').notNull().default(false),
    // Chave-mestra da "experiência gamer" (Mapa de Conquistas, XP, patente).
    // Desligada, nenhuma tela/celebração do jogo aparece e o XP para de contar.
    gamification_enabled: (0, pg_core_1.boolean)('gamification_enabled').notNull().default(true),
    // Quantos XP o vendedor ganha por atendimento fechado como venda. Configurável
    // pelo dono da empresa (só faz sentido com gamification_enabled ligado).
    sale_xp_amount: (0, pg_core_1.integer)('sale_xp_amount').notNull().default(10),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
exports.companyEmailNotify = (0, pg_core_1.pgTable)('company_email_notify', {
    id: (0, pg_core_1.bigserial)('id', { mode: 'number' }).primaryKey(),
    company_id: (0, pg_core_1.uuid)('company_id').notNull().references(() => company_db_schema_1.companies.id, { onDelete: 'cascade' }),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
//# sourceMappingURL=configuracao-geral.db.schema.js.map