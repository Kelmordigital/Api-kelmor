import { FastifyRequest, FastifyReply } from 'fastify';
import { filaService, FilaVinculadaChatbotError } from './fila.service';

export const filaController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const list = await filaService.list(req.user.company_id!);
        return reply.send(list);
    },

    async listAll(req: FastifyRequest, reply: FastifyReply) {
        const { page, perPage, search } = req.query as { page?: string; perPage?: string; search?: string };
        const data = await filaService.listAll(req.user.company_id!, {
            page: page ? Number(page) : 1,
            perPage: perPage ? Number(perPage) : 20,
            search: search ?? undefined,
        });
        return reply.send(data);
    },

    async listUserQueues(req: FastifyRequest, reply: FastifyReply) {
        const list = await filaService.listUserQueues(req.user.company_id!, req.user.id);
        return reply.send(list);
    },

    async listActive(req: FastifyRequest, reply: FastifyReply) {
        const list = await filaService.listActive(req.user.company_id!);
        return reply.send(list);
    },

    async findById(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const row = await filaService.findById(Number(id), req.user.company_id!);
        if (!row) return reply.status(404).send({ error: 'Fila não encontrada' });
        return reply.send(row);
    },

    async eligibleUsers(req: FastifyRequest, reply: FastifyReply) {
        const { id, connectionId } = req.params as { id: string; connectionId: string };
        const rows = await filaService.eligibleUsers(req.user.company_id!, Number(id), Number(connectionId));
        return reply.send(rows);
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { name, color, greeting_message, enabled, distribution } = req.body as {
            name: string;
            color?: string | null;
            greeting_message?: string | null;
            enabled?: boolean;
            distribution?: string;
        };
        if (!name?.trim()) return reply.status(400).send({ error: 'name é obrigatório' });
        const row = await filaService.create(companyId, {
            name: name.trim(),
            color: color ?? null,
            greeting_message: greeting_message?.trim() || null,
            enabled: enabled ?? true,
            distribution: distribution ?? 'none',
        });
        return reply.status(201).send(row);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        const { name, color, greeting_message, enabled, distribution } = req.body as {
            name?: string;
            color?: string | null;
            greeting_message?: string | null;
            enabled?: boolean;
            distribution?: string;
        };
        const payload: Record<string, unknown> = {};
        if (name !== undefined) payload.name = name.trim();
        if (color !== undefined) payload.color = color;
        if (greeting_message !== undefined) payload.greeting_message = greeting_message?.trim() || null;
        if (enabled !== undefined) payload.enabled = enabled;
        if (distribution !== undefined) payload.distribution = distribution;

        const row = await filaService.update(Number(id), companyId, payload);
        if (!row) return reply.status(404).send({ error: 'Fila não encontrada' });
        return reply.send(row);
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { id } = req.params as { id: string };
        try {
            const ok = await filaService.remove(Number(id), companyId);
            if (!ok) return reply.status(404).send({ error: 'Fila não encontrada' });
            return reply.status(204).send();
        } catch (err) {
            if (err instanceof FilaVinculadaChatbotError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    },
};
