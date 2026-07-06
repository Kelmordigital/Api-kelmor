"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmConfigService = void 0;
exports.matchKeywordOrigin = matchKeywordOrigin;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
exports.crmConfigService = {
    // ── Motivos de não venda ─────────────────────────────────────────────────
    async listReasons(companyId) {
        return client_1.db.select().from(atendimento_db_schema_1.crm_sales_reasons)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_sales_reasons.company_id, companyId))
            .orderBy(atendimento_db_schema_1.crm_sales_reasons.id);
    },
    async createReason(companyId, reason, color) {
        const [row] = await client_1.db.insert(atendimento_db_schema_1.crm_sales_reasons)
            .values({ company_id: companyId, reason, color: color ?? null })
            .returning();
        return row;
    },
    async updateReason(id, companyId, reason, color) {
        const [row] = await client_1.db.update(atendimento_db_schema_1.crm_sales_reasons)
            .set({ reason, color: color ?? null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_sales_reasons.id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_sales_reasons.company_id, companyId)))
            .returning();
        return row ?? null;
    },
    async deleteReason(id, companyId) {
        await client_1.db.delete(atendimento_db_schema_1.crm_sales_reasons)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_sales_reasons.id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_sales_reasons.company_id, companyId)));
    },
    // ── Palavras-chave de origem ─────────────────────────────────────────────
    async listKeywords(companyId) {
        return client_1.db.select().from(atendimento_db_schema_1.crm_keywords)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_keywords.company_id, companyId))
            .orderBy(atendimento_db_schema_1.crm_keywords.id);
    },
    async createKeyword(companyId, keyword, origin) {
        const [row] = await client_1.db.insert(atendimento_db_schema_1.crm_keywords)
            .values({ company_id: companyId, keyword: keyword.toLowerCase().trim(), origin: origin.trim() })
            .returning();
        return row;
    },
    async deleteKeyword(id, companyId) {
        await client_1.db.delete(atendimento_db_schema_1.crm_keywords)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_keywords.id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_keywords.company_id, companyId)));
    },
};
/**
 * Verifica se o texto da mensagem contém alguma palavra-chave cadastrada.
 * Retorna o nome da origem correspondente ou null se não houver match.
 */
async function matchKeywordOrigin(companyId, messageText) {
    const keywords = await client_1.db.select().from(atendimento_db_schema_1.crm_keywords)
        .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_keywords.company_id, companyId));
    if (!keywords.length)
        return null;
    const lowerText = messageText.toLowerCase();
    for (const kw of keywords) {
        if (lowerText.includes(kw.keyword.toLowerCase())) {
            return kw.origin;
        }
    }
    return null;
}
//# sourceMappingURL=crm-config.service.js.map