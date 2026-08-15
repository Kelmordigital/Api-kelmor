"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configuracaoGeralService = void 0;
exports.getCompanyPermissions = getCompanyPermissions;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const company_db_schema_1 = require("../companies/company.db.schema");
const configuracao_geral_db_schema_1 = require("./configuracao-geral.db.schema");
const socket_1 = require("../../shared/socket");
function stripHtml(html) {
    if (!html)
        return '';
    return html.replace(/<[^>]+>/g, '').trim();
}
/**
 * Retorna a linha de permissões da empresa, criando-a com os defaults do schema
 * se ainda não existir. Reutilizado por visibilidade de tickets, distribuição de
 * filas e listagem de atendentes elegíveis.
 */
async function getCompanyPermissions(companyId) {
    const perms = await client_1.db.select().from(configuracao_geral_db_schema_1.companyPermissions)
        .where((0, drizzle_orm_1.eq)(configuracao_geral_db_schema_1.companyPermissions.company_id, companyId))
        .then(rows => rows[0] ?? null);
    if (perms)
        return perms;
    const [created] = await client_1.db.insert(configuracao_geral_db_schema_1.companyPermissions)
        .values({ company_id: companyId })
        .returning();
    return created;
}
exports.configuracaoGeralService = {
    async get(companyId) {
        const [company] = await client_1.db.select({
            init_message: company_db_schema_1.companies.init_message,
            end_message: company_db_schema_1.companies.end_message,
            transfer_message: company_db_schema_1.companies.transfer_message,
        }).from(company_db_schema_1.companies).where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId));
        const perms = await getCompanyPermissions(companyId);
        const emailRows = await client_1.db.select({ email: configuracao_geral_db_schema_1.companyEmailNotify.email })
            .from(configuracao_geral_db_schema_1.companyEmailNotify)
            .where((0, drizzle_orm_1.eq)(configuracao_geral_db_schema_1.companyEmailNotify.company_id, companyId));
        return { ...company, ...perms, notify_emails: emailRows.map(r => r.email) };
    },
    async update(companyId, payload) {
        const { init_message, end_message, transfer_message, notify_emails, ...rest } = payload;
        // Remove campos não-editáveis que o frontend pode reenviar acidentalmente
        const { id: _id, company_id: _cid, created_at: _ca, updated_at: _ua, ...permPayload } = rest;
        // Atualiza mensagens na tabela companies (null se vazio)
        await client_1.db.update(company_db_schema_1.companies).set({
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
        }).where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId));
        // Upsert em company_permissions
        if (Object.keys(permPayload).length > 0) {
            await client_1.db.insert(configuracao_geral_db_schema_1.companyPermissions)
                .values({ company_id: companyId, ...permPayload })
                .onConflictDoUpdate({
                target: configuracao_geral_db_schema_1.companyPermissions.company_id,
                set: { ...permPayload, updated_at: new Date() },
            });
        }
        // Substitui a lista de e-mails de notificação (apaga e recria)
        if (notify_emails !== undefined) {
            await client_1.db.delete(configuracao_geral_db_schema_1.companyEmailNotify).where((0, drizzle_orm_1.eq)(configuracao_geral_db_schema_1.companyEmailNotify.company_id, companyId));
            const uniqueEmails = [...new Set(notify_emails.map(e => e.trim()).filter(Boolean))];
            if (uniqueEmails.length > 0) {
                await client_1.db.insert(configuracao_geral_db_schema_1.companyEmailNotify)
                    .values(uniqueEmails.map(email => ({ company_id: companyId, email })));
            }
        }
        // Sem isso, quem já estava com o CRM aberto (qualquer aba/usuário da
        // empresa) só veria a mudança de permissão depois do staleTime padrão
        // do React Query (5min) ou de um refresh manual — toggles como
        // "Permitir pré-visualização do ticket" pareceriam não fazer efeito.
        (0, socket_1.emitToCompany)(companyId, 'company_permissions:updated', {});
        return this.get(companyId);
    },
};
//# sourceMappingURL=configuracao-geral.service.js.map