import { eq, and } from 'drizzle-orm';
import { db } from '../../database/client';
import { crm_sales_reasons, crm_keywords } from '../atendimento/atendimento.db.schema';

export const crmConfigService = {

    // ── Motivos de não venda ─────────────────────────────────────────────────

    async listReasons(companyId: string) {
        return db.select().from(crm_sales_reasons)
            .where(eq(crm_sales_reasons.company_id, companyId))
            .orderBy(crm_sales_reasons.id);
    },

    async createReason(companyId: string, reason: string, color?: string) {
        const [row] = await db.insert(crm_sales_reasons)
            .values({ company_id: companyId, reason, color: color ?? null })
            .returning();
        return row;
    },

    async updateReason(id: number, companyId: string, reason: string, color?: string) {
        const [row] = await db.update(crm_sales_reasons)
            .set({ reason, color: color ?? null })
            .where(and(eq(crm_sales_reasons.id, id), eq(crm_sales_reasons.company_id, companyId)))
            .returning();
        return row ?? null;
    },

    async deleteReason(id: number, companyId: string) {
        await db.delete(crm_sales_reasons)
            .where(and(eq(crm_sales_reasons.id, id), eq(crm_sales_reasons.company_id, companyId)));
    },

    // ── Palavras-chave de origem ─────────────────────────────────────────────

    async listKeywords(companyId: string) {
        return db.select().from(crm_keywords)
            .where(eq(crm_keywords.company_id, companyId))
            .orderBy(crm_keywords.id);
    },

    async createKeyword(companyId: string, keyword: string, origin: string) {
        const [row] = await db.insert(crm_keywords)
            .values({ company_id: companyId, keyword: keyword.toLowerCase().trim(), origin: origin.trim() })
            .returning();
        return row;
    },

    async deleteKeyword(id: number, companyId: string) {
        await db.delete(crm_keywords)
            .where(and(eq(crm_keywords.id, id), eq(crm_keywords.company_id, companyId)));
    },
};

/**
 * Verifica se o texto da mensagem contém alguma palavra-chave cadastrada.
 * Retorna o nome da origem correspondente ou null se não houver match.
 */
export async function matchKeywordOrigin(companyId: string, messageText: string): Promise<string | null> {
    const keywords = await db.select().from(crm_keywords)
        .where(eq(crm_keywords.company_id, companyId));

    if (!keywords.length) return null;

    const lowerText = messageText.toLowerCase();
    for (const kw of keywords) {
        if (lowerText.includes(kw.keyword.toLowerCase())) {
            return kw.origin;
        }
    }
    return null;
}
