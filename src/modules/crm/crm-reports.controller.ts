import { FastifyRequest, FastifyReply } from 'fastify';
import { crmReportsService } from './crm-reports.service';

export const crmReportsController = {

    async salesMade(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user?.company_id;
        if (!companyId) return reply.status(401).send({ error: 'Unauthorized' });

        const { dateInit, dateEnd, userId, queueId, page, perPage } = req.query as any;
        const data = await crmReportsService.salesMade(companyId, {
            dateInit, dateEnd, userId,
            queueId:  queueId  ? Number(queueId)  : undefined,
            page:     page     ? Number(page)      : 1,
            perPage:  perPage  ? Number(perPage)   : 10,
        });
        return reply.send(data);
    },

    async salesNotMade(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user?.company_id;
        if (!companyId) return reply.status(401).send({ error: 'Unauthorized' });

        const { dateInit, dateEnd, userId, queueId, page, perPage } = req.query as any;
        const data = await crmReportsService.salesNotMade(companyId, {
            dateInit, dateEnd, userId,
            queueId: queueId ? Number(queueId) : undefined,
            page:    page    ? Number(page)    : 1,
            perPage: perPage ? Number(perPage) : 10,
        });
        return reply.send(data);
    },

    async reasons(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user?.company_id;
        if (!companyId) return reply.status(401).send({ error: 'Unauthorized' });
        const data = await crmReportsService.reasons(companyId);
        return reply.send(data);
    },

    async channels(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user?.company_id;
        if (!companyId) return reply.status(401).send({ error: 'Unauthorized' });
        const data = await crmReportsService.channels(companyId);
        return reply.send(data);
    },

    async updateSale(req: FastifyRequest, reply: FastifyReply) {
        const companyId = (req as any).user?.company_id;
        if (!companyId) return reply.status(401).send({ error: 'Unauthorized' });

        const { ticketId } = req.params as any;
        const { isSale, salePrice, reasonId } = req.body as any;

        const ok = await crmReportsService.updateSale(Number(ticketId), companyId, {
            isSale:    Boolean(isSale),
            salePrice: salePrice ?? null,
            reasonId:  reasonId  ? Number(reasonId) : null,
        });
        if (!ok) return reply.status(404).send({ error: 'Ticket não encontrado' });
        return reply.send({ ok: true });
    },
};
