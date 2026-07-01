import { eq } from 'drizzle-orm';
import { db } from '../../database/client';
import { companies } from '../companies/company.db.schema';
import { companyPermissions } from './configuracao-geral.db.schema';

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
    // Permissões de mensagens
    show_ticket_name_message?: boolean;
    send_ticket_protocol?: boolean;
    send_ticket_goodbye_msg?: boolean;
    send_ticket_transfer_msg?: boolean;
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

        return { ...company, ...perms };
    },

    async update(companyId: string, payload: ConfiguracaoGeralPayload) {
        const { init_message, end_message, transfer_message, ...permPayload } = payload;

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

        return this.get(companyId);
    },
};
