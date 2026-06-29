-- Mensagens automáticas na tabela companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS init_message text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS end_message text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS transfer_message text;

-- Tabela de permissões/configurações por empresa
CREATE TABLE IF NOT EXISTS company_permissions (
    id bigserial PRIMARY KEY,
    company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

    -- Fechamento automático
    close_open_tickets boolean NOT NULL DEFAULT false,
    close_open_tickets_interval integer NOT NULL DEFAULT 24,
    close_pending_tickets boolean NOT NULL DEFAULT false,
    close_pending_tickets_interval integer NOT NULL DEFAULT 48,

    -- Intervalos entre mensagens (horas)
    interval_between_ended_message real NOT NULL DEFAULT 6,
    interval_between_init_message real NOT NULL DEFAULT 1,
    interval_between_nps real NOT NULL DEFAULT 24,

    -- Pesquisa (minutos de espera antes do envio)
    research_interval bigint NOT NULL DEFAULT 5,

    -- Permissões de mensagens automáticas
    show_ticket_name_message boolean NOT NULL DEFAULT true,
    send_ticket_protocol boolean NOT NULL DEFAULT false,
    send_ticket_goodbye_msg boolean NOT NULL DEFAULT true,
    send_ticket_transfer_msg boolean NOT NULL DEFAULT true,
    send_group_ticket_name_message boolean NOT NULL DEFAULT false,
    send_group_ticket_goodbye_msg boolean NOT NULL DEFAULT false,
    send_group_ticket_protocol boolean NOT NULL DEFAULT false,

    -- Controle de acesso e fluxo
    show_all_tickets boolean NOT NULL DEFAULT false,
    restrict_user boolean NOT NULL DEFAULT false,
    limit_services_users boolean NOT NULL DEFAULT false,
    number_limit_services_users integer NOT NULL DEFAULT 5,
    allow_close_pending_tickets boolean NOT NULL DEFAULT false,
    pullout_only_admins boolean NOT NULL DEFAULT false,
    transfer_between_connections boolean NOT NULL DEFAULT true,
    transfer_online_users boolean NOT NULL DEFAULT false,
    return_ticket boolean NOT NULL DEFAULT false,
    spy_ticket boolean NOT NULL DEFAULT false,
    view_queue_independent_history boolean NOT NULL DEFAULT false,
    restrict_access_user_historic_tickets boolean NOT NULL DEFAULT false,
    not_show_pending_ticket_without_queue boolean NOT NULL DEFAULT false,

    -- Funcionalidades extras
    enable_automatic_tags boolean NOT NULL DEFAULT false,
    update_contact_name boolean NOT NULL DEFAULT true,
    past_ticket_messages boolean NOT NULL DEFAULT false,
    allow_delete_contact boolean NOT NULL DEFAULT false,
    download_contacts boolean NOT NULL DEFAULT false,
    bot_messages_visualization boolean NOT NULL DEFAULT false,
    hide_name_indefinitely boolean NOT NULL DEFAULT false,
    hide_send_no_goodbyemsg boolean NOT NULL DEFAULT false,
    allow_show_campaign_to_commom_user boolean NOT NULL DEFAULT false,
    idle_bot_ticket boolean NOT NULL DEFAULT false,
    internal_chat boolean NOT NULL DEFAULT false,
    active_kanban boolean NOT NULL DEFAULT false,
    group_ticket boolean NOT NULL DEFAULT false,
    order_tickets boolean NOT NULL DEFAULT false,
    api_messages boolean NOT NULL DEFAULT false,
    google_contacts_auto_sync boolean NOT NULL DEFAULT false,

    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
);
