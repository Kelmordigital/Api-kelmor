"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.etiquetaController = void 0;
const etiqueta_service_1 = require("./etiqueta.service");
exports.etiquetaController = {
    async list(req, reply) {
        const companyId = req.user.company_id;
        const list = await etiqueta_service_1.etiquetaService.list(companyId);
        return reply.send(list);
    },
    async stats(req, reply) {
        const companyId = req.user.company_id;
        const data = await etiqueta_service_1.etiquetaService.getStats(companyId);
        return reply.send(data);
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        const { name, color, icon } = req.body;
        if (!name?.trim())
            return reply.status(400).send({ error: 'name é obrigatório' });
        const row = await etiqueta_service_1.etiquetaService.create(companyId, {
            name: name.trim(),
            color: color ?? '#6366f1',
            icon: icon ?? 'tag',
        });
        return reply.status(201).send(row);
    },
    async update(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const body = req.body;
        const row = await etiqueta_service_1.etiquetaService.update(id, companyId, body);
        if (!row)
            return reply.status(404).send({ error: 'Etiqueta não encontrada' });
        return reply.send(row);
    },
    async remove(req, reply) {
        const companyId = req.user.company_id;
        const { id } = req.params;
        const ok = await etiqueta_service_1.etiquetaService.remove(id, companyId);
        if (!ok)
            return reply.status(404).send({ error: 'Etiqueta não encontrada' });
        return reply.status(204).send();
    },
    async aplicarAoContato(req, reply) {
        const companyId = req.user.company_id;
        const { contactId, etiquetaId } = req.params;
        await etiqueta_service_1.etiquetaService.aplicarAoContato(contactId, etiquetaId, companyId);
        return reply.status(204).send();
    },
    async removerDoContato(req, reply) {
        const companyId = req.user.company_id;
        const { contactId, etiquetaId } = req.params;
        await etiqueta_service_1.etiquetaService.removerDoContato(contactId, etiquetaId, companyId);
        return reply.status(204).send();
    },
    async listDoContato(req, reply) {
        const companyId = req.user.company_id;
        const { contactId } = req.params;
        const list = await etiqueta_service_1.etiquetaService.listDoContato(contactId, companyId);
        return reply.send(list);
    },
};
//# sourceMappingURL=etiqueta.controller.js.map