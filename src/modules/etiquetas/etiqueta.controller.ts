import { FastifyRequest, FastifyReply } from 'fastify';
import { etiquetaService } from './etiqueta.service';

export const etiquetaController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const list = await etiquetaService.list(companyId);
        return reply.send(list);
    },

    async stats(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const data = await etiquetaService.getStats(companyId);
        return reply.send(data);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { name, color, icon } = req.body as {
            name: string;
            color?: string;
            icon?: string;
        };
        if (!name?.trim()) return reply.status(400).send({ error: 'name é obrigatório' });
        const row = await etiquetaService.create(companyId, {
            name: name.trim(),
            color: color ?? '#6366f1',
            icon: icon ?? 'tag',
        });
        return reply.status(201).send(row);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const body = req.body as {
            name?: string;
            color?: string;
            icon?: string;
        };
        const row = await etiquetaService.update(id, companyId, body);
        if (!row) return reply.status(404).send({ error: 'Etiqueta não encontrada' });
        return reply.send(row);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const ok = await etiquetaService.remove(id, companyId);
        if (!ok) return reply.status(404).send({ error: 'Etiqueta não encontrada' });
        return reply.status(204).send();
    },

    async aplicarAoContato(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { contactId, etiquetaId } = req.params as { contactId: string; etiquetaId: string };
        await etiquetaService.aplicarAoContato(contactId, etiquetaId, companyId);
        return reply.status(204).send();
    },

    async removerDoContato(req: FastifyRequest, reply: FastifyReply) {
        const { contactId, etiquetaId } = req.params as { contactId: string; etiquetaId: string };
        await etiquetaService.removerDoContato(contactId, etiquetaId);
        return reply.status(204).send();
    },

    async listDoContato(req: FastifyRequest, reply: FastifyReply) {
        const { contactId } = req.params as { contactId: string };
        const list = await etiquetaService.listDoContato(contactId);
        return reply.send(list);
    },
};
