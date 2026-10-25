import type { CompanyPermissionsReader } from '../configuracao-geral/configuracao-geral.service';
import type { AutomaticTagRuleRepository, AutomaticTagRuleWithTags } from './automatic-tag-rule.repository';
import type { ContactTagger } from './etiqueta.service';
export type { AutomaticTagRuleWithTags } from './automatic-tag-rule.repository';
export declare const MAX_AUTOMATIC_TAG_RULES = 10;
/** Cadastro das regras "palavras-chave → etiquetas" da empresa. */
export declare class AutomaticTagRuleService {
    private readonly repository;
    constructor(repository: AutomaticTagRuleRepository);
    list(companyId: string): Promise<AutomaticTagRuleWithTags[]>;
    create(companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags>;
    update(id: number, companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags>;
    remove(id: number, companyId: string): Promise<boolean>;
    private static ruleNotFound;
}
/** Aplica etiquetas a partir de uma mensagem recebida — o que o atendimento precisa (ISP). */
export interface MessageAutoTagger {
    applyFor(companyId: string, contactId: number, messageText: string): Promise<void>;
}
/**
 * Etiquetamento automático: com a chave ligada nas configurações da empresa,
 * cada regra cujas palavras-chave aparecem na mensagem aplica suas etiquetas
 * ao contato (cada etiqueta uma vez, mesmo que várias regras casem).
 */
export declare class AutomaticTagger implements MessageAutoTagger {
    private readonly rules;
    private readonly permissions;
    private readonly tagger;
    constructor(rules: AutomaticTagRuleRepository, permissions: CompanyPermissionsReader, tagger: ContactTagger);
    applyFor(companyId: string, contactId: number, messageText: string): Promise<void>;
}
//# sourceMappingURL=automatic-tag-rule.service.d.ts.map