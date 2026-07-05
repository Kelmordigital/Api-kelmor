"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campanhaController = void 0;
const campanha_service_1 = require("./campanha.service");
exports.campanhaController = {
    async list(req, reply) {
        const data = await campanha_service_1.campanhaService.list(req.user.company_id);
        return reply.send(data);
    },
    async getSelects(req, reply) {
        const data = await campanha_service_1.campanhaService.getSelects(req.user.company_id);
        return reply.send(data);
    },
    async create(req, reply) {
        const body = req.body;
        if (!body.title?.trim())
            return reply.status(400).send({ message: 'O título é obrigatório' });
        if (!body.message?.trim())
            return reply.status(400).send({ message: 'A mensagem é obrigatória' });
        if (!body.send_date)
            return reply.status(400).send({ message: 'A data de envio é obrigatória' });
        if (!body.connection_ids?.length)
            return reply.status(400).send({ message: 'Selecione ao menos uma conexão' });
        const campaign = await campanha_service_1.campanhaService.create(req.user.company_id, {
            title: body.title.trim(),
            message: body.message.trim(),
            type: body.type,
            send_date: body.send_date,
            timezone: body.timezone,
            all_contacts: body.all_contacts,
            connection_ids: body.connection_ids,
            contact_ids: body.contact_ids,
        });
        return reply.status(201).send(campaign);
    },
    async update(req, reply) {
        const { id } = req.params;
        const body = req.body;
        await campanha_service_1.campanhaService.update(Number(id), req.user.company_id, body);
        return reply.send({ ok: true });
    },
    async remove(req, reply) {
        const { id } = req.params;
        const removed = await campanha_service_1.campanhaService.remove(Number(id), req.user.company_id);
        if (!removed)
            return reply.status(404).send({ message: 'Campanha não encontrada' });
        return reply.send({ ok: true });
    },
    async play(req, reply) {
        const { id } = req.params;
        const ok = await campanha_service_1.campanhaService.play(Number(id), req.user.company_id);
        if (!ok)
            return reply.status(404).send({ message: 'Campanha não encontrada' });
        return reply.send({ ok: true });
    },
    async pause(req, reply) {
        const { id } = req.params;
        const ok = await campanha_service_1.campanhaService.pause(Number(id), req.user.company_id);
        if (!ok)
            return reply.status(404).send({ message: 'Campanha não encontrada' });
        return reply.send({ ok: true });
    },
    // ── Textos de Agendamento ─────────────────────────────────────────────────
    async listTexts(req, reply) {
        const data = await campanha_service_1.campanhaService.listTexts(req.user.company_id);
        return reply.send(data);
    },
    async upsertText(req, reply) {
        const body = req.body;
        if (!body.label?.trim())
            return reply.status(400).send({ message: 'O rótulo é obrigatório' });
        if (!body.type)
            return reply.status(400).send({ message: 'O tipo é obrigatório' });
        const result = await campanha_service_1.campanhaService.upsertText(req.user.company_id, {
            label: body.label.trim(),
            text: body.text,
            type: Number(body.type),
        });
        return reply.send(result);
    },
    async updateText(req, reply) {
        const { id } = req.params;
        const body = req.body;
        if (!body.label?.trim())
            return reply.status(400).send({ message: 'O rótulo é obrigatório' });
        const result = await campanha_service_1.campanhaService.updateText(Number(id), req.user.company_id, {
            label: body.label.trim(),
            text: body.text,
        });
        if (!result)
            return reply.status(404).send({ message: 'Texto não encontrado' });
        return reply.send(result);
    },
    async removeText(req, reply) {
        const { id } = req.params;
        const removed = await campanha_service_1.campanhaService.removeText(Number(id), req.user.company_id);
        if (!removed)
            return reply.status(404).send({ message: 'Texto não encontrado' });
        return reply.send({ ok: true });
    },
};
//# sourceMappingURL=campanha.controller.js.map