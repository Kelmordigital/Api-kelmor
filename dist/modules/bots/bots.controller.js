"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.botsController = void 0;
const bots_service_1 = require("./bots.service");
exports.botsController = {
    async list(req, reply) {
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.list(companyId));
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const body = req.body;
        if (!body?.name?.trim())
            return reply.status(400).send({ error: 'name é obrigatório' });
        const bot = await bots_service_1.botsService.create(companyId, body);
        return reply.status(201).send(bot);
    },
    async update(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.update(Number(id), companyId, req.body));
    },
    async remove(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        await bots_service_1.botsService.delete(Number(id), companyId);
        return reply.send({ ok: true });
    },
    async toggleActive(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.toggleActive(Number(id), companyId));
    },
    async setDefault(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.setDefault(Number(id), companyId));
    },
    async getNodes(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        return reply.send(await bots_service_1.botsService.getNodes(Number(id), companyId));
    },
    async syncNodes(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const { nodes } = req.body;
        if (!Array.isArray(nodes))
            return reply.status(400).send({ error: 'nodes deve ser um array' });
        await bots_service_1.botsService.syncNodes(Number(id), companyId, nodes);
        return reply.send({ ok: true });
    },
};
//# sourceMappingURL=bots.controller.js.map