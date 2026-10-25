import type { DB } from '../../database/client';
export interface AutomaticTagRuleWithTags {
    id: number;
    keywords: string;
    etiqueta_ids: string[];
    created_at: Date | null;
    updated_at: Date | null;
}
export interface AutomaticTagRuleRepository {
    listByCompany(companyId: string): Promise<AutomaticTagRuleWithTags[]>;
    countByCompany(companyId: string): Promise<number>;
    /** Grava a regra com as etiquetas informadas que forem da empresa (as demais são ignoradas). */
    create(companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags>;
    /** Substitui palavras-chave e etiquetas numa transação; null se a regra não é da empresa. */
    replace(id: number, companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags | null>;
    delete(id: number, companyId: string): Promise<boolean>;
}
export declare class DrizzleAutomaticTagRuleRepository implements AutomaticTagRuleRepository {
    private readonly db;
    constructor(db: DB);
    listByCompany(companyId: string): Promise<AutomaticTagRuleWithTags[]>;
    countByCompany(companyId: string): Promise<number>;
    create(companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags>;
    replace(id: number, companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags | null>;
    delete(id: number, companyId: string): Promise<boolean>;
    /** Só etiquetas da própria empresa entram na regra. */
    private saveTags;
}
//# sourceMappingURL=automatic-tag-rule.repository.d.ts.map