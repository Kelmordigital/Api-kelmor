import { FastifyRequest, FastifyReply } from 'fastify';
import { botsService } from './bots.service';

export const botsController = {

    async list(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        return reply.send(await botsService.list(companyId));
    },

    async create(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const body = req.body as any;
        if (!body?.name?.trim()) return reply.status(400).send({ error: 'name é obrigatório' });
        const bot = await botsService.create(companyId, body);
        return reply.status(201).send(bot);
    },

    async update(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        return reply.send(await botsService.update(Number(id), companyId, req.body as any));
    },

    async remove(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        await botsService.delete(Number(id), companyId);
        return reply.send({ ok: true });
    },

    async toggleActive(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        return reply.send(await botsService.toggleActive(Number(id), companyId));
    },

    async setDefault(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        return reply.send(await botsService.setDefault(Number(id), companyId));
    },

    async getNodes(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        return reply.send(await botsService.getNodes(Number(id), companyId));
    },

    async syncNodes(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const { nodes } = req.body as { nodes: any[] };
        if (!Array.isArray(nodes)) return reply.status(400).send({ error: 'nodes deve ser um array' });
        await botsService.syncNodes(Number(id), companyId, nodes);
        return reply.send({ ok: true });
    },
};
