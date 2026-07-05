-- Adiciona campos de permissões que faltavam na tabela company_permissions
ALTER TABLE company_permissions
  ADD COLUMN IF NOT EXISTS idle_bot_ticket_queue_id bigint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS create_ticket_api_msg boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_show_name_on_chat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_by_email_connection boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active_crm boolean NOT NULL DEFAULT false;
