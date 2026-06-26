import { FastifyRequest, FastifyReply } from 'fastify';
import { filaService } from './fila.service';

export const filaController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const list = await filaService.list(req.user.company_id!);
        return reply.send(list);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { name, color, greeting_message, enabled } = req.body as {
            name: string;
            color?: string | null;
            greeting_message?: string | null;
            enabled?: boolean;
        };
        if (!name?.trim()) return reply.status(400).send({ error: 'name é obrigatório' });
        const row = await filaService.create(companyId, {
            name: name.trim(),
            color: color ?? null,
            greeting_message: greeting_message?.trim() || null,
            enabled: enabled ?? true,
        });
        return reply.status(201).send(row);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const { name, color, greeting_message, enabled } = req.body as {
            name?: string;
            color?: string | null;
            greeting_message?: string | null;
            enabled?: boolean;
        };
        const payload: Record<string, unknown> = {};
        if (name !== undefined) payload.name = name.trim();
        if (color !== undefined) payload.color = color;
        if (greeting_message !== undefined) payload.greeting_message = greeting_message?.trim() || null;
        if (enabled !== undefined) payload.enabled = enabled;

        const row = await filaService.update(Number(id), companyId, payload);
        if (!row) return reply.status(404).send({ error: 'Fila não encontrada' });
        return reply.send(row);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const ok = await filaService.remove(Number(id), companyId);
        if (!ok) return reply.status(404).send({ error: 'Fila não encontrada' });
        return reply.status(204).send();
    },
};
