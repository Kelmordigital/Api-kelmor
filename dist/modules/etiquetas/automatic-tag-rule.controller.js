"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.automaticTagRuleController = void 0;
const automatic_tag_rule_service_1 = require("./automatic-tag-rule.service");
exports.automaticTagRuleController = {
    async list(req, reply) {
        const companyId = req.user.company_id;
        const list = await automatic_tag_rule_service_1.automaticTagRuleService.list(companyId);
        return reply.send(list);
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const { keywords, etiqueta_ids } = req.body;
        if (!keywords?.trim())
            return reply.status(400).send({ error: 'keywords é obrigatório' });
        try {
            const row = await automatic_tag_rule_service_1.automaticTagRuleService.create(companyId, keywords.trim(), etiqueta_ids ?? []);
            return reply.status(201).send(row);
        }
        catch (err) {
            return reply.status(400).send({ error: err instanceof Error ? err.message : 'Erro ao criar regra' });
        }
    },
    async update(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const { keywords, etiqueta_ids } = req.body;
        if (!keywords?.trim())
            return reply.status(400).send({ error: 'keywords é obrigatório' });
        const row = await automatic_tag_rule_service_1.automaticTagRuleService.update(Number(id), companyId, keywords.trim(), etiqueta_ids ?? []);
        if (!row)
            return reply.status(404).send({ error: 'Regra não encontrada' });
        return reply.send(row);
    },
    async remove(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const ok = await automatic_tag_rule_service_1.automaticTagRuleService.remove(Number(id), companyId);
        if (!ok)
            return reply.status(404).send({ error: 'Regra não encontrada' });
        return reply.status(204).send();
    },
};
//# sourceMappingURL=automatic-tag-rule.controller.js.map