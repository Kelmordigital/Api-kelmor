import { FastifyRequest, FastifyReply } from 'fastify';
import { crmTimelineService, ContactNaoEncontradoError } from './crm-timeline.service';

export const crmTimelineController = {

    async getTimeline(req: FastifyRequest, reply: FastifyReply) {
        const { contactId } = req.params as { contactId: string };
        const companyId = req.user.company_id!;
        try {
            const items = await crmTimelineService.getTimeline(Number(contactId), companyId);
            return reply.send(items);
        } catch (err) {
            if (err instanceof ContactNaoEncontradoError) return reply.status(404).send({ error: err.message });
            throw err;
        }
    },

    async addNote(req: FastifyRequest, reply: FastifyReply) {
        const { contactId } = req.params as { contactId: string };
        const companyId = req.user.company_id!;
        const { body } = req.body as { body?: string };
        if (!body?.trim()) return reply.status(400).send({ error: 'body obrigatório' });

        try {
            const item = await crmTimelineService.addNote(Number(contactId), companyId, req.user.id, body.trim());
            return reply.send(item);
        } catch (err) {
            if (err instanceof ContactNaoEncontradoError) return reply.status(404).send({ error: err.message });
            throw err;
        }
    },
};
