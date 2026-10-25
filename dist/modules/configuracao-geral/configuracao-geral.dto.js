"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateConfiguracaoGeralSchema = exports.OPTIONAL_ID_PERMISSIONS = exports.DECIMAL_PERMISSIONS = exports.INTEGER_PERMISSIONS = exports.BOOLEAN_PERMISSIONS = void 0;
exports.updateInputFrom = updateInputFrom;
const zod_1 = require("zod");
/**
 * Permissões editáveis pelo admin, por tipo. Coluna nova em company_permissions
 * só fica editável quando entra numa destas listas (há teste garantindo que
 * nenhuma coluna fique de fora sem decisão).
 */
exports.BOOLEAN_PERMISSIONS = [
    'close_open_tickets', 'close_pending_tickets',
    'show_ticket_name_message', 'send_ticket_protocol', 'send_ticket_goodbye_msg', 'send_ticket_transfer_msg',
    'send_group_ticket_name_message', 'send_group_ticket_goodbye_msg', 'send_group_ticket_protocol',
    'show_all_tickets', 'restrict_user', 'limit_services_users', 'allow_close_pending_tickets',
    'pullout_only_admins', 'transfer_between_connections', 'transfer_online_users', 'return_ticket',
    'spy_ticket', 'view_queue_independent_history', 'restrict_access_user_historic_tickets',
    'not_show_pending_ticket_without_queue',
    'enable_automatic_tags', 'update_contact_name', 'past_ticket_messages', 'allow_delete_contact',
    'download_contacts', 'bot_messages_visualization', 'hide_name_indefinitely', 'hide_send_no_goodbyemsg',
    'allow_show_campaign_to_commom_user', 'idle_bot_ticket', 'internal_chat', 'active_kanban', 'group_ticket',
    'order_tickets', 'api_messages', 'create_ticket_api_msg', 'allow_show_name_on_chat',
    'notify_by_email_connection', 'active_crm', 'google_contacts_auto_sync', 'gamification_enabled',
];
/** Inteiros com valor mínimo (horas, minutos, quantidades, XP). */
exports.INTEGER_PERMISSIONS = {
    close_open_tickets_interval: 0,
    close_pending_tickets_interval: 0,
    research_interval: 0,
    number_limit_services_users: 1,
    sale_xp_amount: 0,
};
/** Intervalos em horas, aceitam fração (ex.: 0.5 = 30 min). */
exports.DECIMAL_PERMISSIONS = [
    'interval_between_ended_message', 'interval_between_init_message', 'interval_between_nps',
];
/** Fila para onde vão tickets parados no bot; null = nenhuma. */
exports.OPTIONAL_ID_PERMISSIONS = ['idle_bot_ticket_queue_id'];
const invalid = (field) => `${field} inválido`;
const permissionShape = {
    ...Object.fromEntries(exports.BOOLEAN_PERMISSIONS.map((f) => [f, zod_1.z.boolean({ error: invalid(f) }).optional()])),
    ...Object.fromEntries(Object.entries(exports.INTEGER_PERMISSIONS).map(([f, min]) => [
        f, zod_1.z.number({ error: invalid(f) }).int(invalid(f)).min(min, invalid(f)).optional(),
    ])),
    ...Object.fromEntries(exports.DECIMAL_PERMISSIONS.map((f) => [f, zod_1.z.number({ error: invalid(f) }).min(0, invalid(f)).optional()])),
    ...Object.fromEntries(exports.OPTIONAL_ID_PERMISSIONS.map((f) => [
        f, zod_1.z.number({ error: invalid(f) }).int(invalid(f)).positive(invalid(f)).nullish(),
    ])),
};
const message = (field) => zod_1.z.string({ error: invalid(field) }).nullish();
/**
 * Edição parcial. Campos fora do contrato (id, company_id, datas que o front
 * reenvia junto com o formulário) são descartados.
 */
exports.updateConfiguracaoGeralSchema = zod_1.z.object({
    init_message: message('init_message'),
    end_message: message('end_message'),
    transfer_message: message('transfer_message'),
    notify_emails: zod_1.z.array(zod_1.z.string({ error: invalid('notify_emails') }), { error: invalid('notify_emails') }).optional(),
    ...permissionShape,
}, { error: 'Corpo da requisição inválido' });
/** Separa mensagens, e-mails e permissões do corpo já validado. */
function updateInputFrom(body) {
    const { init_message, end_message, transfer_message, notify_emails, ...rest } = body;
    const permissions = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    return { init_message, end_message, transfer_message, notify_emails, permissions };
}
//# sourceMappingURL=configuracao-geral.dto.js.map