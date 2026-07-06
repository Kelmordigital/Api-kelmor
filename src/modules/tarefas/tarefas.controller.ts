import { FastifyRequest, FastifyReply } from 'fastify';
import { tarefasService } from './tarefas.service';

/**
 * Quadro híbrido: cada usuário gerencia o próprio quadro; admins podem
 * VISUALIZAR o quadro de outro usuário via ?owner_id= (somente leitura).
 */
function resolveOwner(req: FastifyRequest, reply: FastifyReply): string | null {
    const { owner_id } = req.query as { owner_id?: string };
    if (!owner_id || owner_id === req.user.id) return req.user.id;

    const isAdmin = req.user.profile_tag === 'admin' || req.user.profile_tag === 'superAdmin';
    if (!isAdmin) {
        reply.status(403).send({ error: 'Apenas administradores podem ver o quadro de outros usuários.' });
        return null;
    }
    return owner_id;
}

export const tarefasController = {

    async board(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const ownerId = resolveOwner(req, reply);
        if (!ownerId) return;

        const board = await tarefasService.getBoard(companyId, ownerId);
        return reply.send(board);
    },

    async archived(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const ownerId = resolveOwner(req, reply);
        if (!ownerId) return;

        const rows = await tarefasService.getArchived(companyId, ownerId);
        return reply.send(rows);
    },

    async byContact(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { contactId } = req.params as { contactId: string };
        const parsed = Number(contactId);
        if (!Number.isFinite(parsed)) return reply.status(400).send({ error: 'contactId inválido' });

        const rows = await tarefasService.listByContact(companyId, req.user.id, parsed);
        return reply.send(rows);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const body = req.body as {
            titulo: string;
            descricao?: string;
            contact_id?: number;
            due_date?: string;
            column_id?: string;
        };

        if (!body?.titulo?.trim()) return reply.status(400).send({ error: 'titulo é obrigatório' });

        const row = await tarefasService.create(companyId, req.user.id, {
            titulo: body.titulo.trim(),
            descricao: body.descricao ?? null,
            contact_id: body.contact_id ?? null,
            due_date: body.due_date ? new Date(body.due_date) : null,
            column_id: body.column_id ?? null,
        });

        return reply.status(201).send(row);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { id } = req.params as { id: string };
        const body = req.body as { titulo?: string; descricao?: string | null; due_date?: string | null; contact_id?: number | null };

        const payload: Parameters<typeof tarefasService.update>[3] = {};
        if (body.titulo     !== undefined) payload.titulo     = body.titulo.trim();
        if (body.descricao  !== undefined) payload.descricao  = body.descricao;
        if (body.contact_id !== undefined) payload.contact_id = body.contact_id;
        if (body.due_date   !== undefined) payload.due_date   = body.due_date ? new Date(body.due_date) : null;

        const row = await tarefasService.update(id, companyId, req.user.id, payload);
        if (!row) return reply.status(404).send({ error: 'Tarefa não encontrada' });
        return reply.send(row);
    },

    async move(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { id } = req.params as { id: string };
        const { column_id, index } = req.body as { column_id: string; index?: number };
        if (!column_id) return reply.status(400).send({ error: 'column_id é obrigatório' });

        const row = await tarefasService.move(id, companyId, req.user.id, column_id, index ?? 0);
        if (!row) return reply.status(404).send({ error: 'Tarefa ou coluna não encontrada' });
        return reply.send(row);
    },

    async setDone(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { id } = req.params as { id: string };
        const { done } = req.body as { done?: boolean };

        const row = await tarefasService.setDone(id, companyId, req.user.id, done ?? true);
        if (!row) return reply.status(404).send({ error: 'Tarefa não encontrada' });
        return reply.send(row);
    },

    async setArchived(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { id } = req.params as { id: string };
        const { archived } = req.body as { archived?: boolean };

        const row = await tarefasService.setArchived(id, companyId, req.user.id, archived ?? true);
        if (!row) return reply.status(404).send({ error: 'Tarefa não encontrada' });
        return reply.send(row);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { id } = req.params as { id: string };
        const ok = await tarefasService.remove(id, companyId, req.user.id);
        if (!ok) return reply.status(404).send({ error: 'Tarefa não encontrada' });
        return reply.status(204).send();
    },

    // ── Colunas ──────────────────────────────────────────────────────────────

    async createColumn(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { title } = req.body as { title?: string };
        if (!title?.trim()) return reply.status(400).send({ error: 'title é obrigatório' });

        const row = await tarefasService.createColumn(companyId, req.user.id, title.trim());
        return reply.status(201).send(row);
    },

    async renameColumn(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { id } = req.params as { id: string };
        const { title } = req.body as { title?: string };
        if (!title?.trim()) return reply.status(400).send({ error: 'title é obrigatório' });

        const row = await tarefasService.renameColumn(id, companyId, req.user.id, title.trim());
        if (!row) return reply.status(404).send({ error: 'Coluna não encontrada' });
        return reply.send(row);
    },

    async deleteColumn(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(403).send({ error: 'Empresa não encontrada' });

        const { id } = req.params as { id: string };
        const ok = await tarefasService.deleteColumn(id, companyId, req.user.id);
        if (!ok) return reply.status(404).send({ error: 'Coluna não encontrada ou não pode ser excluída' });
        return reply.status(204).send();
    },
};
