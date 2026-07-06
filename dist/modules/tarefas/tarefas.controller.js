"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tarefasController = void 0;
const tarefas_service_1 = require("./tarefas.service");
/**
 * Quadro híbrido: cada usuário gerencia o próprio quadro; admins podem
 * VISUALIZAR o quadro de outro usuário via ?owner_id= (somente leitura).
 */
function resolveOwner(req, reply) {
    const { owner_id } = req.query;
    if (!owner_id || owner_id === req.user.id)
        return req.user.id;
    const isAdmin = req.user.profile_tag === 'admin' || req.user.profile_tag === 'superAdmin';
    if (!isAdmin) {
        reply.status(403).send({ error: 'Apenas administradores podem ver o quadro de outros usuários.' });
        return null;
    }
    return owner_id;
}
exports.tarefasController = {
    async board(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const ownerId = resolveOwner(req, reply);
        if (!ownerId)
            return;
        const board = await tarefas_service_1.tarefasService.getBoard(companyId, ownerId);
        return reply.send(board);
    },
    async archived(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const ownerId = resolveOwner(req, reply);
        if (!ownerId)
            return;
        const rows = await tarefas_service_1.tarefasService.getArchived(companyId, ownerId);
        return reply.send(rows);
    },
    async byContact(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const { contactId } = req.params;
        const parsed = Number(contactId);
        if (!Number.isFinite(parsed))
            return reply.status(400).send({ error: 'contactId inválido' });
        const rows = await tarefas_service_1.tarefasService.listByContact(companyId, req.user.id, parsed);
        return reply.send(rows);
    },
    async create(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const body = req.body;
        if (!body?.titulo?.trim())
            return reply.status(400).send({ error: 'titulo é obrigatório' });
        const row = await tarefas_service_1.tarefasService.create(companyId, req.user.id, {
            titulo: body.titulo.trim(),
            descricao: body.descricao ?? null,
            contact_id: body.contact_id ?? null,
            due_date: body.due_date ? new Date(body.due_date) : null,
            column_id: body.column_id ?? null,
        });
        return reply.status(201).send(row);
    },
    async update(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const { id } = req.params;
        const body = req.body;
        const payload = {};
        if (body.titulo !== undefined)
            payload.titulo = body.titulo.trim();
        if (body.descricao !== undefined)
            payload.descricao = body.descricao;
        if (body.contact_id !== undefined)
            payload.contact_id = body.contact_id;
        if (body.due_date !== undefined)
            payload.due_date = body.due_date ? new Date(body.due_date) : null;
        const row = await tarefas_service_1.tarefasService.update(id, companyId, req.user.id, payload);
        if (!row)
            return reply.status(404).send({ error: 'Tarefa não encontrada' });
        return reply.send(row);
    },
    async move(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const { id } = req.params;
        const { column_id, index } = req.body;
        if (!column_id)
            return reply.status(400).send({ error: 'column_id é obrigatório' });
        const row = await tarefas_service_1.tarefasService.move(id, companyId, req.user.id, column_id, index ?? 0);
        if (!row)
            return reply.status(404).send({ error: 'Tarefa ou coluna não encontrada' });
        return reply.send(row);
    },
    async setDone(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const { id } = req.params;
        const { done } = req.body;
        const row = await tarefas_service_1.tarefasService.setDone(id, companyId, req.user.id, done ?? true);
        if (!row)
            return reply.status(404).send({ error: 'Tarefa não encontrada' });
        return reply.send(row);
    },
    async setArchived(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const { id } = req.params;
        const { archived } = req.body;
        const row = await tarefas_service_1.tarefasService.setArchived(id, companyId, req.user.id, archived ?? true);
        if (!row)
            return reply.status(404).send({ error: 'Tarefa não encontrada' });
        return reply.send(row);
    },
    async remove(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const { id } = req.params;
        const ok = await tarefas_service_1.tarefasService.remove(id, companyId, req.user.id);
        if (!ok)
            return reply.status(404).send({ error: 'Tarefa não encontrada' });
        return reply.status(204).send();
    },
    // ── Colunas ──────────────────────────────────────────────────────────────
    async createColumn(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const { title } = req.body;
        if (!title?.trim())
            return reply.status(400).send({ error: 'title é obrigatório' });
        const row = await tarefas_service_1.tarefasService.createColumn(companyId, req.user.id, title.trim());
        return reply.status(201).send(row);
    },
    async renameColumn(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const { id } = req.params;
        const { title } = req.body;
        if (!title?.trim())
            return reply.status(400).send({ error: 'title é obrigatório' });
        const row = await tarefas_service_1.tarefasService.renameColumn(id, companyId, req.user.id, title.trim());
        if (!row)
            return reply.status(404).send({ error: 'Coluna não encontrada' });
        return reply.send(row);
    },
    async deleteColumn(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(403).send({ error: 'Empresa não encontrada' });
        const { id } = req.params;
        const ok = await tarefas_service_1.tarefasService.deleteColumn(id, companyId, req.user.id);
        if (!ok)
            return reply.status(404).send({ error: 'Coluna não encontrada ou não pode ser excluída' });
        return reply.status(204).send();
    },
};
//# sourceMappingURL=tarefas.controller.js.map