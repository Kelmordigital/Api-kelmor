"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pesquisaController = void 0;
const pesquisa_service_1 = require("./pesquisa.service");
exports.pesquisaController = {
    async list(req, reply) {
        const companyId = req.user.company_id;
        const data = await pesquisa_service_1.pesquisaService.list(companyId);
        return reply.send(data);
    },
    async listActive(req, reply) {
        const companyId = req.user.company_id;
        const data = await pesquisa_service_1.pesquisaService.listActive(companyId);
        return reply.send(data);
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const body = req.body;
        if (!body.name?.trim()) {
            return reply.status(400).send({ message: 'O nome da pesquisa é obrigatório' });
        }
        if (!body.answers?.length) {
            return reply.status(400).send({ message: 'Adicione ao menos uma opção de resposta' });
        }
        const research = await pesquisa_service_1.pesquisaService.create(companyId, {
            name: body.name.trim(),
            type: body.type,
            active: body.active,
            default_research: body.default_research,
            answers: body.answers,
            queue_ids: body.queue_ids,
        });
        return reply.status(201).send(research);
    },
    async update(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const body = req.body;
        await pesquisa_service_1.pesquisaService.update(Number(id), companyId, body);
        return reply.send({ ok: true });
    },
    async remove(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const removed = await pesquisa_service_1.pesquisaService.remove(Number(id), companyId);
        if (!removed)
            return reply.status(404).send({ message: 'Pesquisa não encontrada' });
        return reply.send({ ok: true });
    },
};
//# sourceMappingURL=pesquisa.controller.js.map