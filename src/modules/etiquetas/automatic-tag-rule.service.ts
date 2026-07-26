import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../../database/client';
import { automaticTagRules, automaticTagRuleTags, etiquetas, AutomaticTagRule } from './etiqueta.db.schema';

export const MAX_AUTOMATIC_TAG_RULES = 10;

export interface AutomaticTagRuleWithTags {
    id: number;
    keywords: string;
    etiqueta_ids: string[];
    created_at: Date | null;
    updated_at: Date | null;
}

async function withTags(rules: AutomaticTagRule[]): Promise<AutomaticTagRuleWithTags[]> {
    if (!rules.length) return [];

    const ruleIds = rules.map(r => r.id);
    const tagRows = await db
        .select({ rule_id: automaticTagRuleTags.rule_id, etiqueta_id: automaticTagRuleTags.etiqueta_id })
        .from(automaticTagRuleTags)
        .where(inArray(automaticTagRuleTags.rule_id, ruleIds));

    return rules.map(rule => ({
        id: rule.id,
        keywords: rule.keywords,
        etiqueta_ids: tagRows.filter(t => t.rule_id === rule.id).map(t => t.etiqueta_id),
        created_at: rule.created_at,
        updated_at: rule.updated_at,
    }));
}

export const automaticTagRuleService = {

    async list(companyId: string): Promise<AutomaticTagRuleWithTags[]> {
        const rules = await db
            .select()
            .from(automaticTagRules)
            .where(eq(automaticTagRules.company_id, companyId))
            .orderBy(automaticTagRules.created_at);
        return withTags(rules);
    },

    async create(companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags> {
        const [{ count }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(automaticTagRules)
            .where(eq(automaticTagRules.company_id, companyId));
        if (count >= MAX_AUTOMATIC_TAG_RULES) {
            throw new Error(`Limite de ${MAX_AUTOMATIC_TAG_RULES} regras de etiquetamento automático atingido`);
        }

        const validTagIds = await validTagIdsForCompany(companyId, etiquetaIds);

        const [rule] = await db
            .insert(automaticTagRules)
            .values({ company_id: companyId, keywords })
            .returning();

        if (validTagIds.length) {
            await db.insert(automaticTagRuleTags).values(
                validTagIds.map(etiqueta_id => ({ rule_id: rule.id, etiqueta_id })),
            );
        }

        const [withTagsResult] = await withTags([rule]);
        return withTagsResult;
    },

    async update(id: number, companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags | null> {
        const [rule] = await db
            .update(automaticTagRules)
            .set({ keywords, updated_at: new Date() })
            .where(and(eq(automaticTagRules.id, id), eq(automaticTagRules.company_id, companyId)))
            .returning();

        if (!rule) return null;

        const validTagIds = await validTagIdsForCompany(companyId, etiquetaIds);

        await db.delete(automaticTagRuleTags).where(eq(automaticTagRuleTags.rule_id, id));
        if (validTagIds.length) {
            await db.insert(automaticTagRuleTags).values(
                validTagIds.map(etiqueta_id => ({ rule_id: id, etiqueta_id })),
            );
        }

        const [withTagsResult] = await withTags([rule]);
        return withTagsResult;
    },

    async remove(id: number, companyId: string): Promise<boolean> {
        const [row] = await db
            .delete(automaticTagRules)
            .where(and(eq(automaticTagRules.id, id), eq(automaticTagRules.company_id, companyId)))
            .returning();
        return !!row;
    },
};

/** Filtra para só ids de etiquetas que de fato pertencem à empresa (evita cross-company). */
async function validTagIdsForCompany(companyId: string, etiquetaIds: string[]): Promise<string[]> {
    if (!etiquetaIds.length) return [];
    const rows = await db
        .select({ id: etiquetas.id })
        .from(etiquetas)
        .where(and(eq(etiquetas.company_id, companyId), inArray(etiquetas.id, etiquetaIds)));
    return rows.map(r => r.id);
}
