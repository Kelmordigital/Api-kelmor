"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.automaticTagRuleService = exports.MAX_AUTOMATIC_TAG_RULES = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const etiqueta_db_schema_1 = require("./etiqueta.db.schema");
exports.MAX_AUTOMATIC_TAG_RULES = 10;
async function withTags(rules) {
    if (!rules.length)
        return [];
    const ruleIds = rules.map(r => r.id);
    const tagRows = await client_1.db
        .select({ rule_id: etiqueta_db_schema_1.automaticTagRuleTags.rule_id, etiqueta_id: etiqueta_db_schema_1.automaticTagRuleTags.etiqueta_id })
        .from(etiqueta_db_schema_1.automaticTagRuleTags)
        .where((0, drizzle_orm_1.inArray)(etiqueta_db_schema_1.automaticTagRuleTags.rule_id, ruleIds));
    return rules.map(rule => ({
        id: rule.id,
        keywords: rule.keywords,
        etiqueta_ids: tagRows.filter(t => t.rule_id === rule.id).map(t => t.etiqueta_id),
        created_at: rule.created_at,
        updated_at: rule.updated_at,
    }));
}
exports.automaticTagRuleService = {
    async list(companyId) {
        const rules = await client_1.db
            .select()
            .from(etiqueta_db_schema_1.automaticTagRules)
            .where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.company_id, companyId))
            .orderBy(etiqueta_db_schema_1.automaticTagRules.created_at);
        return withTags(rules);
    },
    async create(companyId, keywords, etiquetaIds) {
        const [{ count }] = await client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(etiqueta_db_schema_1.automaticTagRules)
            .where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.company_id, companyId));
        if (count >= exports.MAX_AUTOMATIC_TAG_RULES) {
            throw new Error(`Limite de ${exports.MAX_AUTOMATIC_TAG_RULES} regras de etiquetamento automático atingido`);
        }
        const validTagIds = await validTagIdsForCompany(companyId, etiquetaIds);
        const [rule] = await client_1.db
            .insert(etiqueta_db_schema_1.automaticTagRules)
            .values({ company_id: companyId, keywords })
            .returning();
        if (validTagIds.length) {
            await client_1.db.insert(etiqueta_db_schema_1.automaticTagRuleTags).values(validTagIds.map(etiqueta_id => ({ rule_id: rule.id, etiqueta_id })));
        }
        const [withTagsResult] = await withTags([rule]);
        return withTagsResult;
    },
    async update(id, companyId, keywords, etiquetaIds) {
        const [rule] = await client_1.db
            .update(etiqueta_db_schema_1.automaticTagRules)
            .set({ keywords, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.id, id), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.company_id, companyId)))
            .returning();
        if (!rule)
            return null;
        const validTagIds = await validTagIdsForCompany(companyId, etiquetaIds);
        await client_1.db.delete(etiqueta_db_schema_1.automaticTagRuleTags).where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRuleTags.rule_id, id));
        if (validTagIds.length) {
            await client_1.db.insert(etiqueta_db_schema_1.automaticTagRuleTags).values(validTagIds.map(etiqueta_id => ({ rule_id: id, etiqueta_id })));
        }
        const [withTagsResult] = await withTags([rule]);
        return withTagsResult;
    },
    async remove(id, companyId) {
        const [row] = await client_1.db
            .delete(etiqueta_db_schema_1.automaticTagRules)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.id, id), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.company_id, companyId)))
            .returning();
        return !!row;
    },
};
/** Filtra para só ids de etiquetas que de fato pertencem à empresa (evita cross-company). */
async function validTagIdsForCompany(companyId, etiquetaIds) {
    if (!etiquetaIds.length)
        return [];
    const rows = await client_1.db
        .select({ id: etiqueta_db_schema_1.etiquetas.id })
        .from(etiqueta_db_schema_1.etiquetas)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId), (0, drizzle_orm_1.inArray)(etiqueta_db_schema_1.etiquetas.id, etiquetaIds)));
    return rows.map(r => r.id);
}
//# sourceMappingURL=automatic-tag-rule.service.js.map