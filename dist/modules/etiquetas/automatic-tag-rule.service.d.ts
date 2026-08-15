export declare const MAX_AUTOMATIC_TAG_RULES = 10;
export interface AutomaticTagRuleWithTags {
    id: number;
    keywords: string;
    etiqueta_ids: string[];
    created_at: Date | null;
    updated_at: Date | null;
}
export declare const automaticTagRuleService: {
    list(companyId: string): Promise<AutomaticTagRuleWithTags[]>;
    create(companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags>;
    update(id: number, companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags | null>;
    remove(id: number, companyId: string): Promise<boolean>;
};
//# sourceMappingURL=automatic-tag-rule.service.d.ts.map