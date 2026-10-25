import { eq, and, inArray, sql } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { automaticTagRules, automaticTagRuleTags, etiquetas } from './etiqueta.db.schema';

export interface AutomaticTagRuleWithTags {
    id: number;
    keywords: string;
    etiqueta_ids: string[];
    created_at: Date | null;
    updated_at: Date | null;
}

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export interface AutomaticTagRuleRepository {
    listByCompany(companyId: string): Promise<AutomaticTagRuleWithTags[]>;
    countByCompany(companyId: string): Promise<number>;
    /** Grava a regra com as etiquetas informadas que forem da empresa (as demais são ignoradas). */
    create(companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags>;
    /** Substitui palavras-chave e etiquetas numa transação; null se a regra não é da empresa. */
    replace(id: number, companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags | null>;
    delete(id: number, companyId: string): Promise<boolean>;
}

export class DrizzleAutomaticTagRuleRepository implements AutomaticTagRuleRepository {
    constructor(private readonly db: DB) {}

    async listByCompany(companyId: string): Promise<AutomaticTagRuleWithTags[]> {
        const rules = await this.db.select().from(automaticTagRules)
            .where(eq(automaticTagRules.company_id, companyId))
            .orderBy(automaticTagRules.created_at);
        if (rules.length === 0) return [];

        const tags = await this.db.select().from(automaticTagRuleTags)
            .where(inArray(automaticTagRuleTags.rule_id, rules.map((r) => r.id)));
        return rules.map((rule) => ({
            id: rule.id,
            keywords: rule.keywords,
            etiqueta_ids: tags.filter((t) => t.rule_id === rule.id).map((t) => t.etiqueta_id),
            created_at: rule.created_at,
            updated_at: rule.updated_at,
        }));
    }

    async countByCompany(companyId: string): Promise<number> {
        const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` })
            .from(automaticTagRules)
            .where(eq(automaticTagRules.company_id, companyId));
        return total;
    }

    create(companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags> {
        return this.db.transaction(async (tx) => {
            const [rule] = await tx.insert(automaticTagRules).values({ company_id: companyId, keywords }).returning();
            const tagIds = await this.saveTags(tx, rule.id, companyId, etiquetaIds);
            return { id: rule.id, keywords: rule.keywords, etiqueta_ids: tagIds, created_at: rule.created_at, updated_at: rule.updated_at };
        });
    }

    replace(id: number, companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags | null> {
        return this.db.transaction(async (tx) => {
            const [rule] = await tx.update(automaticTagRules)
                .set({ keywords, updated_at: new Date() })
                .where(and(eq(automaticTagRules.id, id), eq(automaticTagRules.company_id, companyId)))
                .returning();
            if (!rule) return null;

            await tx.delete(automaticTagRuleTags).where(eq(automaticTagRuleTags.rule_id, id));
            const tagIds = await this.saveTags(tx, id, companyId, etiquetaIds);
            return { id: rule.id, keywords: rule.keywords, etiqueta_ids: tagIds, created_at: rule.created_at, updated_at: rule.updated_at };
        });
    }

    async delete(id: number, companyId: string): Promise<boolean> {
        const [row] = await this.db.delete(automaticTagRules)
            .where(and(eq(automaticTagRules.id, id), eq(automaticTagRules.company_id, companyId)))
            .returning({ id: automaticTagRules.id });
        return !!row;
    }

    /** Só etiquetas da própria empresa entram na regra. */
    private async saveTags(tx: Tx, ruleId: number, companyId: string, etiquetaIds: string[]): Promise<string[]> {
        if (etiquetaIds.length === 0) return [];
        const owned = await tx.select({ id: etiquetas.id }).from(etiquetas)
            .where(and(eq(etiquetas.company_id, companyId), inArray(etiquetas.id, etiquetaIds)));
        if (owned.length > 0) {
            await tx.insert(automaticTagRuleTags).values(owned.map((t) => ({ rule_id: ruleId, etiqueta_id: t.id })));
        }
        return owned.map((t) => t.id);
    }
}
