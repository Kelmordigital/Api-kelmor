"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmConfigController = void 0;
const crm_config_service_1 = require("./crm-config.service");
exports.crmConfigController = {
    // ── Reasons ──────────────────────────────────────────────────────────────
    async listReasons(req, reply) {
        const companyId = req.user.company_id;
        return reply.send(await crm_config_service_1.crmConfigService.listReasons(companyId));
    },
    async createReason(req, reply) {
        const companyId = req.user.company_id;
        const { reason, color } = req.body;
        if (!reason?.trim())
            return reply.status(400).send({ error: 'Motivo obrigatório' });
        return reply.status(201).send(await crm_config_service_1.crmConfigService.createReason(companyId, reason.trim(), color));
    },
    async updateReason(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const { reason, color } = req.body;
        const row = await crm_config_service_1.crmConfigService.updateReason(Number(id), companyId, reason.trim(), color);
        if (!row)
            return reply.status(404).send({ error: 'Não encontrado' });
        return reply.send(row);
    },
    async deleteReason(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        await crm_config_service_1.crmConfigService.deleteReason(Number(id), companyId);
        return reply.send({ ok: true });
    },
    // ── Keywords ─────────────────────────────────────────────────────────────
    async listKeywords(req, reply) {
        const companyId = req.user.company_id;
        return reply.send(await crm_config_service_1.crmConfigService.listKeywords(companyId));
    },
    async createKeyword(req, reply) {
        const companyId = req.user.company_id;
        const { keyword, origin } = req.body;
        if (!keyword?.trim() || !origin?.trim())
            return reply.status(400).send({ error: 'Palavra-chave e origem obrigatórias' });
        return reply.status(201).send(await crm_config_service_1.crmConfigService.createKeyword(companyId, keyword, origin));
    },
    async deleteKeyword(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        await crm_config_service_1.crmConfigService.deleteKeyword(Number(id), companyId);
        return reply.send({ ok: true });
    },
};
//# sourceMappingURL=crm-config.controller.js.map