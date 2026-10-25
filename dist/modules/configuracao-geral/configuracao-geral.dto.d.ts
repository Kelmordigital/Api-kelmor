import { z } from 'zod';
import type { CompanyPermission } from './configuracao-geral.db.schema';
type PermissionField = keyof Omit<CompanyPermission, 'id' | 'company_id' | 'created_at' | 'updated_at'>;
/**
 * Permissões editáveis pelo admin, por tipo. Coluna nova em company_permissions
 * só fica editável quando entra numa destas listas (há teste garantindo que
 * nenhuma coluna fique de fora sem decisão).
 */
export declare const BOOLEAN_PERMISSIONS: readonly ["close_open_tickets", "close_pending_tickets", "show_ticket_name_message", "send_ticket_protocol", "send_ticket_goodbye_msg", "send_ticket_transfer_msg", "send_group_ticket_name_message", "send_group_ticket_goodbye_msg", "send_group_ticket_protocol", "show_all_tickets", "restrict_user", "limit_services_users", "allow_close_pending_tickets", "pullout_only_admins", "transfer_between_connections", "transfer_online_users", "return_ticket", "spy_ticket", "view_queue_independent_history", "restrict_access_user_historic_tickets", "not_show_pending_ticket_without_queue", "enable_automatic_tags", "update_contact_name", "past_ticket_messages", "allow_delete_contact", "download_contacts", "bot_messages_visualization", "hide_name_indefinitely", "hide_send_no_goodbyemsg", "allow_show_campaign_to_commom_user", "idle_bot_ticket", "internal_chat", "active_kanban", "group_ticket", "order_tickets", "api_messages", "create_ticket_api_msg", "allow_show_name_on_chat", "notify_by_email_connection", "active_crm", "google_contacts_auto_sync", "gamification_enabled"];
/** Inteiros com valor mínimo (horas, minutos, quantidades, XP). */
export declare const INTEGER_PERMISSIONS: {
    readonly close_open_tickets_interval: 0;
    readonly close_pending_tickets_interval: 0;
    readonly research_interval: 0;
    readonly number_limit_services_users: 1;
    readonly sale_xp_amount: 0;
};
/** Intervalos em horas, aceitam fração (ex.: 0.5 = 30 min). */
export declare const DECIMAL_PERMISSIONS: readonly ["interval_between_ended_message", "interval_between_init_message", "interval_between_nps"];
/** Fila para onde vão tickets parados no bot; null = nenhuma. */
export declare const OPTIONAL_ID_PERMISSIONS: readonly ["idle_bot_ticket_queue_id"];
/**
 * Edição parcial. Campos fora do contrato (id, company_id, datas que o front
 * reenvia junto com o formulário) são descartados.
 */
export declare const updateConfiguracaoGeralSchema: z.ZodObject<{
    init_message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    end_message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    transfer_message: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notify_emails: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type PermissionsPatch = Partial<Pick<CompanyPermission, PermissionField>>;
export interface UpdateConfiguracaoGeralInput {
    init_message?: string | null;
    end_message?: string | null;
    transfer_message?: string | null;
    notify_emails?: string[];
    permissions: PermissionsPatch;
}
/** Separa mensagens, e-mails e permissões do corpo já validado. */
export declare function updateInputFrom(body: z.infer<typeof updateConfiguracaoGeralSchema>): UpdateConfiguracaoGeralInput;
export {};
//# sourceMappingURL=configuracao-geral.dto.d.ts.map