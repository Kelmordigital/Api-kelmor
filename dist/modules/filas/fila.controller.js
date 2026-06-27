"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filaController = void 0;
const fila_service_1 = require("./fila.service");
exports.filaController = {
    async list(req, reply) {
        const list = await fila_service_1.filaService.list(req.user.company_id);
        return reply.send(list);
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const { name, color, greeting_message, enabled } = req.body;
        if (!name?.trim())
            return reply.status(400).send({ error: 'name é obrigatório' });
        const row = await fila_service_1.filaService.create(companyId, {
            name: name.trim(),
            color: color ?? null,
            greeting_message: greeting_message?.trim() || null,
            enabled: enabled ?? true,
        });
        return reply.status(201).send(row);
    },
    async update(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const { name, color, greeting_message, enabled } = req.body;
        const payload = {};
        if (name !== undefined)
            payload.name = name.trim();
        if (color !== undefined)
            payload.color = color;
        if (greeting_message !== undefined)
            payload.greeting_message = greeting_message?.trim() || null;
        if (enabled !== undefined)
            payload.enabled = enabled;
        const row = await fila_service_1.filaService.update(Number(id), companyId, payload);
        if (!row)
            return reply.status(404).send({ error: 'Fila não encontrada' });
        return reply.send(row);
    },
    async remove(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const ok = await fila_service_1.filaService.remove(Number(id), companyId);
        if (!ok)
            return reply.status(404).send({ error: 'Fila não encontrada' });
        return reply.status(204).send();
    },
};
//# sourceMappingURL=fila.controller.js.map