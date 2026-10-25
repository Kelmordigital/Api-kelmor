"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleAutomaticTagRuleRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const etiqueta_db_schema_1 = require("./etiqueta.db.schema");
class DrizzleAutomaticTagRuleRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async listByCompany(companyId) {
        const rules = await this.db.select().from(etiqueta_db_schema_1.automaticTagRules)
            .where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.company_id, companyId))
            .orderBy(etiqueta_db_schema_1.automaticTagRules.created_at);
        if (rules.length === 0)
            return [];
        const tags = await this.db.select().from(etiqueta_db_schema_1.automaticTagRuleTags)
            .where((0, drizzle_orm_1.inArray)(etiqueta_db_schema_1.automaticTagRuleTags.rule_id, rules.map((r) => r.id)));
        return rules.map((rule) => ({
            id: rule.id,
            keywords: rule.keywords,
            etiqueta_ids: tags.filter((t) => t.rule_id === rule.id).map((t) => t.etiqueta_id),
            created_at: rule.created_at,
            updated_at: rule.updated_at,
        }));
    }
    async countByCompany(companyId) {
        const [{ total }] = await this.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(etiqueta_db_schema_1.automaticTagRules)
            .where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.company_id, companyId));
        return total;
    }
    create(companyId, keywords, etiquetaIds) {
        return this.db.transaction(async (tx) => {
            const [rule] = await tx.insert(etiqueta_db_schema_1.automaticTagRules).values({ company_id: companyId, keywords }).returning();
            const tagIds = await this.saveTags(tx, rule.id, companyId, etiquetaIds);
            return { id: rule.id, keywords: rule.keywords, etiqueta_ids: tagIds, created_at: rule.created_at, updated_at: rule.updated_at };
        });
    }
    replace(id, companyId, keywords, etiquetaIds) {
        return this.db.transaction(async (tx) => {
            const [rule] = await tx.update(etiqueta_db_schema_1.automaticTagRules)
                .set({ keywords, updated_at: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.id, id), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.company_id, companyId)))
                .returning();
            if (!rule)
                return null;
            await tx.delete(etiqueta_db_schema_1.automaticTagRuleTags).where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRuleTags.rule_id, id));
            const tagIds = await this.saveTags(tx, id, companyId, etiquetaIds);
            return { id: rule.id, keywords: rule.keywords, etiqueta_ids: tagIds, created_at: rule.created_at, updated_at: rule.updated_at };
        });
    }
    async delete(id, companyId) {
        const [row] = await this.db.delete(etiqueta_db_schema_1.automaticTagRules)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.id, id), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.automaticTagRules.company_id, companyId)))
            .returning({ id: etiqueta_db_schema_1.automaticTagRules.id });
        return !!row;
    }
    /** Só etiquetas da própria empresa entram na regra. */
    async saveTags(tx, ruleId, companyId, etiquetaIds) {
        if (etiquetaIds.length === 0)
            return [];
        const owned = await tx.select({ id: etiqueta_db_schema_1.etiquetas.id }).from(etiqueta_db_schema_1.etiquetas)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId), (0, drizzle_orm_1.inArray)(etiqueta_db_schema_1.etiquetas.id, etiquetaIds)));
        if (owned.length > 0) {
            await tx.insert(etiqueta_db_schema_1.automaticTagRuleTags).values(owned.map((t) => ({ rule_id: ruleId, etiqueta_id: t.id })));
        }
        return owned.map((t) => t.id);
    }
}
exports.DrizzleAutomaticTagRuleRepository = DrizzleAutomaticTagRuleRepository;
//# sourceMappingURL=automatic-tag-rule.repository.js.map