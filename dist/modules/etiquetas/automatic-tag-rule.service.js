"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomaticTagger = exports.AutomaticTagRuleService = exports.MAX_AUTOMATIC_TAG_RULES = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const keyword_rule_1 = require("./keyword-rule");
exports.MAX_AUTOMATIC_TAG_RULES = 10;
/** Cadastro das regras "palavras-chave → etiquetas" da empresa. */
class AutomaticTagRuleService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    list(companyId) {
        return this.repository.listByCompany(companyId);
    }
    async create(companyId, keywords, etiquetaIds) {
        if ((await this.repository.countByCompany(companyId)) >= exports.MAX_AUTOMATIC_TAG_RULES) {
            throw new http_errors_1.BadRequestError(`Limite de ${exports.MAX_AUTOMATIC_TAG_RULES} regras de etiquetamento automático atingido`);
        }
        return this.repository.create(companyId, keywords, etiquetaIds);
    }
    async update(id, companyId, keywords, etiquetaIds) {
        const rule = await this.repository.replace(id, companyId, keywords, etiquetaIds);
        if (!rule)
            throw AutomaticTagRuleService.ruleNotFound();
        return rule;
    }
    async remove(id, companyId) {
        if (!(await this.repository.delete(id, companyId)))
            throw AutomaticTagRuleService.ruleNotFound();
        return true;
    }
    static ruleNotFound() {
        return new http_errors_1.NotFoundError('Regra não encontrada');
    }
}
exports.AutomaticTagRuleService = AutomaticTagRuleService;
/**
 * Etiquetamento automático: com a chave ligada nas configurações da empresa,
 * cada regra cujas palavras-chave aparecem na mensagem aplica suas etiquetas
 * ao contato (cada etiqueta uma vez, mesmo que várias regras casem).
 */
class AutomaticTagger {
    rules;
    permissions;
    tagger;
    constructor(rules, permissions, tagger) {
        this.rules = rules;
        this.permissions = permissions;
        this.tagger = tagger;
    }
    async applyFor(companyId, contactId, messageText) {
        if (!(await this.permissions.forCompany(companyId)).enable_automatic_tags)
            return;
        const matched = (await this.rules.listByCompany(companyId))
            .filter((rule) => new keyword_rule_1.KeywordRule(rule.keywords).matches(messageText));
        const tagIds = new Set(matched.flatMap((rule) => rule.etiqueta_ids));
        for (const etiquetaId of tagIds) {
            await this.tagger.applyToContact(companyId, contactId, etiquetaId);
        }
    }
}
exports.AutomaticTagger = AutomaticTagger;
//# sourceMappingURL=automatic-tag-rule.service.js.map