"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filaController = void 0;
const fila_service_1 = require("./fila.service");
exports.filaController = {
    async list(req, reply) {
        const list = await fila_service_1.filaService.list(req.user.company_id);
        return reply.send(list);
    },
    async listAll(req, reply) {
        const { page, perPage, search } = req.query;
        const data = await fila_service_1.filaService.listAll(req.user.company_id, {
            page: page ? Number(page) : 1,
            perPage: perPage ? Number(perPage) : 20,
            search: search ?? undefined,
        });
        return reply.send(data);
    },
    async listUserQueues(req, reply) {
        const list = await fila_service_1.filaService.listUserQueues(req.user.company_id, req.user.id);
        return reply.send(list);
    },
    async listActive(req, reply) {
        const list = await fila_service_1.filaService.listActive(req.user.company_id);
        return reply.send(list);
    },
    async findById(req, reply) {
        const { id } = req.params;
        const row = await fila_service_1.filaService.findById(Number(id), req.user.company_id);
        if (!row)
            return reply.status(404).send({ error: 'Fila não encontrada' });
        return reply.send(row);
    },
    async eligibleUsers(req, reply) {
        const { id, connectionId } = req.params;
        const rows = await fila_service_1.filaService.eligibleUsers(req.user.company_id, Number(id), Number(connectionId));
        return reply.send(rows);
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const { name, color, greeting_message, enabled, distribution } = req.body;
        if (!name?.trim())
            return reply.status(400).send({ error: 'name é obrigatório' });
        const row = await fila_service_1.filaService.create(companyId, {
            name: name.trim(),
            color: color ?? null,
            greeting_message: greeting_message?.trim() || null,
            enabled: enabled ?? true,
            distribution: distribution ?? 'none',
        });
        return reply.status(201).send(row);
    },
    async update(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const { name, color, greeting_message, enabled, distribution } = req.body;
        const payload = {};
        if (name !== undefined)
            payload.name = name.trim();
        if (color !== undefined)
            payload.color = color;
        if (greeting_message !== undefined)
            payload.greeting_message = greeting_message?.trim() || null;
        if (enabled !== undefined)
            payload.enabled = enabled;
        if (distribution !== undefined)
            payload.distribution = distribution;
        const row = await fila_service_1.filaService.update(Number(id), companyId, payload);
        if (!row)
            return reply.status(404).send({ error: 'Fila não encontrada' });
        return reply.send(row);
    },
    async remove(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        try {
            const ok = await fila_service_1.filaService.remove(Number(id), companyId);
            if (!ok)
                return reply.status(404).send({ error: 'Fila não encontrada' });
            return reply.status(204).send();
        }
        catch (err) {
            if (err instanceof fila_service_1.FilaVinculadaChatbotError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    },
};
//# sourceMappingURL=fila.controller.js.map