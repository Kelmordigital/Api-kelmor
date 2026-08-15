"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.etiquetaService = void 0;
exports.matchAndApplyAutomaticTags = matchAndApplyAutomaticTags;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const etiqueta_db_schema_1 = require("./etiqueta.db.schema");
const configuracao_geral_db_schema_1 = require("../configuracao-geral/configuracao-geral.db.schema");
exports.etiquetaService = {
    async list(companyId) {
        return client_1.db
            .select()
            .from(etiqueta_db_schema_1.etiquetas)
            .where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId))
            .orderBy((0, drizzle_orm_1.desc)(etiqueta_db_schema_1.etiquetas.created_at));
    },
    async findById(id, companyId) {
        const [row] = await client_1.db
            .select()
            .from(etiqueta_db_schema_1.etiquetas)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.id, id), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId)))
            .limit(1);
        return row ?? null;
    },
    async create(companyId, payload) {
        const [row] = await client_1.db
            .insert(etiqueta_db_schema_1.etiquetas)
            .values({ ...payload, company_id: companyId })
            .returning();
        return row;
    },
    async update(id, companyId, payload) {
        const [row] = await client_1.db
            .update(etiqueta_db_schema_1.etiquetas)
            .set({ ...payload, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.id, id), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId)))
            .returning();
        return row ?? null;
    },
    async remove(id, companyId) {
        const [row] = await client_1.db
            .delete(etiqueta_db_schema_1.etiquetas)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.id, id), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId)))
            .returning();
        return !!row;
    },
    async getStats(companyId) {
        const list = await exports.etiquetaService.list(companyId);
        const today = new Date();
        const stats = await Promise.all(list.map(async (et) => {
            const total = await client_1.db
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(etiqueta_db_schema_1.contactEtiquetas)
                .where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, et.id))
                .then(r => r[0]?.count ?? 0);
            // Série dos últimos 7 dias
            const series = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(today);
                d.setDate(d.getDate() - (6 - i));
                return { date: d.toISOString().slice(0, 10), count: 0 };
            });
            return {
                etiqueta_id: et.id,
                name: et.name,
                color: et.color,
                total_leads: total,
                series,
            };
        }));
        return stats;
    },
    async aplicarAoContato(contactId, etiquetaId, companyId) {
        const et = await exports.etiquetaService.findById(etiquetaId, companyId);
        if (!et)
            throw new Error('Etiqueta não encontrada');
        await client_1.db
            .insert(etiqueta_db_schema_1.contactEtiquetas)
            .values({ contact_id: contactId, etiqueta_id: etiquetaId })
            .onConflictDoNothing();
    },
    async removerDoContato(contactId, etiquetaId) {
        await client_1.db
            .delete(etiqueta_db_schema_1.contactEtiquetas)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.contact_id, contactId), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, etiquetaId)));
    },
    async listDoContato(contactId) {
        const rows = await client_1.db
            .select({ etiqueta: etiqueta_db_schema_1.etiquetas })
            .from(etiqueta_db_schema_1.contactEtiquetas)
            .innerJoin(etiqueta_db_schema_1.etiquetas, (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, etiqueta_db_schema_1.etiquetas.id))
            .where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.contact_id, contactId));
        return rows.map(r => r.etiqueta);
    },
};
/**
 * Etiquetamento automático: casa o texto de uma mensagem contra as regras
 * (at_automatic_tag_rules) cadastradas pela empresa. Cada regra tem uma
 * lista de variações de palavra-chave separadas por vírgula (ex: "fralda,
 * frauda, fraldinha") — qualquer uma delas ativa a regra — e pode apontar
 * para múltiplas etiquetas. Idempotente via ON CONFLICT DO NOTHING em
 * aplicarAoContato.
 */
async function matchAndApplyAutomaticTags(companyId, contactId, messageText) {
    const [perm] = await client_1.db
        .select({ enable_automatic_tags: configuracao_geral_db_schema_1.companyPermissions.enable_automatic_tags })
        .from(configuracao_geral_db_schema_1.companyPermissions)
        .where((0, drizzle_orm_1.eq)(configuracao_geral_db_schema_1.companyPermissions.company_id, companyId))
        .limit(1);
    if (!perm?.enable_automatic_tags)
        return;
    const rules = await client_1.db
        .select()
        .from(etiqueta_db_schema_1.automaticTagRules)
        .where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.company_id, companyId));
    if (!rules.length)
        return;
    const lowerText = messageText.toLowerCase();
    const matchedRuleIds = rules
        .filter(rule => rule.keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
        .some((kw) => lowerText.includes(kw)))
        .map(rule => rule.id);
    if (!matchedRuleIds.length)
        return;
    const tagRows = await client_1.db
        .select({ etiqueta_id: etiqueta_db_schema_1.automaticTagRuleTags.etiqueta_id })
        .from(etiqueta_db_schema_1.automaticTagRuleTags)
        .where((0, drizzle_orm_1.inArray)(etiqueta_db_schema_1.automaticTagRuleTags.rule_id, matchedRuleIds));
    const uniqueTagIds = [...new Set(tagRows.map(r => r.etiqueta_id))];
    for (const etiquetaId of uniqueTagIds) {
        await exports.etiquetaService.aplicarAoContato(String(contactId), etiquetaId, companyId);
    }
}
//# sourceMappingURL=etiqueta.service.js.map