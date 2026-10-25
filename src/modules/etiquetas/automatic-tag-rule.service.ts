import { BadRequestError, NotFoundError } from '../../core/errors/http-errors';
import type { CompanyPermissionsReader } from '../configuracao-geral/configuracao-geral.service';
import type { AutomaticTagRuleRepository, AutomaticTagRuleWithTags } from './automatic-tag-rule.repository';
import type { ContactTagger } from './etiqueta.service';
import { KeywordRule } from './keyword-rule';

export type { AutomaticTagRuleWithTags } from './automatic-tag-rule.repository';

export const MAX_AUTOMATIC_TAG_RULES = 10;

/** Cadastro das regras "palavras-chave → etiquetas" da empresa. */
export class AutomaticTagRuleService {
    constructor(private readonly repository: AutomaticTagRuleRepository) {}

    list(companyId: string): Promise<AutomaticTagRuleWithTags[]> {
        return this.repository.listByCompany(companyId);
    }

    async create(companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags> {
        if ((await this.repository.countByCompany(companyId)) >= MAX_AUTOMATIC_TAG_RULES) {
            throw new BadRequestError(`Limite de ${MAX_AUTOMATIC_TAG_RULES} regras de etiquetamento automático atingido`);
        }
        return this.repository.create(companyId, keywords, etiquetaIds);
    }

    async update(id: number, companyId: string, keywords: string, etiquetaIds: string[]): Promise<AutomaticTagRuleWithTags> {
        const rule = await this.repository.replace(id, companyId, keywords, etiquetaIds);
        if (!rule) throw AutomaticTagRuleService.ruleNotFound();
        return rule;
    }

    async remove(id: number, companyId: string): Promise<boolean> {
        if (!(await this.repository.delete(id, companyId))) throw AutomaticTagRuleService.ruleNotFound();
        return true;
    }

    private static ruleNotFound() {
        return new NotFoundError('Regra não encontrada');
    }
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
export class AutomaticTagger implements MessageAutoTagger {
    constructor(
        private readonly rules: AutomaticTagRuleRepository,
        private readonly permissions: CompanyPermissionsReader,
        private readonly tagger: ContactTagger,
    ) {}

    async applyFor(companyId: string, contactId: number, messageText: string): Promise<void> {
        if (!(await this.permissions.forCompany(companyId)).enable_automatic_tags) return;

        const matched = (await this.rules.listByCompany(companyId))
            .filter((rule) => new KeywordRule(rule.keywords).matches(messageText));
        const tagIds = new Set(matched.flatMap((rule) => rule.etiqueta_ids));

        for (const etiquetaId of tagIds) {
            await this.tagger.applyToContact(companyId, contactId, etiquetaId);
        }
    }
}
