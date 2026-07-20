import { eq } from 'drizzle-orm';
import { db } from '../../database/client';
import { companies } from '../companies/company.db.schema';
import { companyPermissions, companyEmailNotify } from './configuracao-geral.db.schema';

export interface ConfiguracaoGeralPayload {
    // Mensagens
    init_message?: string | null;
    end_message?: string | null;
    transfer_message?: string | null;
    // Fechamento automático
    close_open_tickets?: boolean;
    close_open_tickets_interval?: number;
    close_pending_tickets?: boolean;
    close_pending_tickets_interval?: number;
    // Intervalos
    interval_between_ended_message?: number;
    interval_between_init_message?: number;
    interval_between_nps?: number;
    research_interval?: number;
    // Mensagens automáticas
    show_ticket_name_message?: boolean;
    send_ticket_protocol?: boolean;
    send_ticket_goodbye_msg?: boolean;
    send_ticket_transfer_msg?: boolean;
    send_group_ticket_name_message?: boolean;
    send_group_ticket_goodbye_msg?: boolean;
    send_group_ticket_protocol?: boolean;
    // Controle de acesso e fluxo
    show_all_tickets?: boolean;
    restrict_user?: boolean;
    limit_services_users?: boolean;
    number_limit_services_users?: number;
    allow_close_pending_tickets?: boolean;
    pullout_only_admins?: boolean;
    transfer_between_connections?: boolean;
    transfer_online_users?: boolean;
    return_ticket?: boolean;
    spy_ticket?: boolean;
    view_queue_independent_history?: boolean;
    allow_show_campaign_to_commom_user?: boolean;
    not_show_pending_ticket_without_queue?: boolean;
    idle_bot_ticket?: boolean;
    idle_bot_ticket_queue_id?: number | null;
    // Funcionalidades extras
    enable_automatic_tags?: boolean;
    update_contact_name?: boolean;
    past_ticket_messages?: boolean;
    allow_delete_contact?: boolean;
    download_contacts?: boolean;
    bot_messages_visualization?: boolean;
    hide_name_indefinitely?: boolean;
    hide_send_no_goodbyemsg?: boolean;
    allow_show_name_on_chat?: boolean;
    create_ticket_api_msg?: boolean;
    notify_by_email_connection?: boolean;
    notify_emails?: string[];
    active_crm?: boolean;
    active_kanban?: boolean;
    group_ticket?: boolean;
    google_contacts_auto_sync?: boolean;
    restrict_access_user_historic_tickets?: boolean;
}

function stripHtml(html: string | null | undefined): string {
    if (!html) return '';
    return html.replace(/<[^>]+>/g, '').trim();
}

/**
 * Retorna a linha de permissões da empresa, criando-a com os defaults do schema
 * se ainda não existir. Reutilizado por visibilidade de tickets, distribuição de
 * filas e listagem de atendentes elegíveis.
 */
export async function getCompanyPermissions(companyId: string) {
    const perms = await db.select().from(companyPermissions)
        .where(eq(companyPermissions.company_id, companyId))
        .then(rows => rows[0] ?? null);

    if (perms) return perms;

    const [created] = await db.insert(companyPermissions)
        .values({ company_id: companyId })
        .returning();
    return created;
}

export const configuracaoGeralService = {

    async get(companyId: string) {
        const [company] = await db.select({
            init_message: companies.init_message,
            end_message: companies.end_message,
            transfer_message: companies.transfer_message,
        }).from(companies).where(eq(companies.id, companyId));

        const perms = await getCompanyPermissions(companyId);

        const emailRows = await db.select({ email: companyEmailNotify.email })
            .from(companyEmailNotify)
            .where(eq(companyEmailNotify.company_id, companyId));

        return { ...company, ...perms, notify_emails: emailRows.map(r => r.email) };
    },

    async update(companyId: string, payload: ConfiguracaoGeralPayload) {
        const { init_message, end_message, transfer_message, notify_emails, ...rest } = payload;

        // Remove campos não-editáveis que o frontend pode reenviar acidentalmente
        const { id: _id, company_id: _cid, created_at: _ca, updated_at: _ua, ...permPayload } = rest as any;

        // Atualiza mensagens na tabela companies (null se vazio)
        await db.update(companies).set({
            init_message: init_message !== undefined
                ? (stripHtml(init_message) === '' ? null : init_message)
                : undefined,
            end_message: end_message !== undefined
                ? (stripHtml(end_message) === '' ? null : end_message)
                : undefined,
            transfer_message: transfer_message !== undefined
                ? (stripHtml(transfer_message) === '' ? null : transfer_message)
                : undefined,
            updated_at: new Date(),
        }).where(eq(companies.id, companyId));

        // Upsert em company_permissions
        if (Object.keys(permPayload).length > 0) {
            await db.insert(companyPermissions)
                .values({ company_id: companyId, ...permPayload })
                .onConflictDoUpdate({
                    target: companyPermissions.company_id,
                    set: { ...permPayload, updated_at: new Date() },
                });
        }

        // Substitui a lista de e-mails de notificação (apaga e recria)
        if (notify_emails !== undefined) {
            await db.delete(companyEmailNotify).where(eq(companyEmailNotify.company_id, companyId));
            const uniqueEmails = [...new Set(notify_emails.map(e => e.trim()).filter(Boolean))];
            if (uniqueEmails.length > 0) {
                await db.insert(companyEmailNotify)
                    .values(uniqueEmails.map(email => ({ company_id: companyId, email })));
            }
        }

        return this.get(companyId);
    },
};
