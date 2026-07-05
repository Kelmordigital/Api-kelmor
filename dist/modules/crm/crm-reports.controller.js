"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmReportsController = void 0;
const crm_reports_service_1 = require("./crm-reports.service");
exports.crmReportsController = {
    async salesMade(req, reply) {
        const companyId = req.user?.company_id;
        if (!companyId)
            return reply.status(401).send({ error: 'Unauthorized' });
        const { dateInit, dateEnd, userId, queueId, page, perPage } = req.query;
        const data = await crm_reports_service_1.crmReportsService.salesMade(companyId, {
            dateInit, dateEnd, userId,
            queueId: queueId ? Number(queueId) : undefined,
            page: page ? Number(page) : 1,
            perPage: perPage ? Number(perPage) : 10,
        });
        return reply.send(data);
    },
    async salesNotMade(req, reply) {
        const companyId = req.user?.company_id;
        if (!companyId)
            return reply.status(401).send({ error: 'Unauthorized' });
        const { dateInit, dateEnd, userId, queueId, page, perPage } = req.query;
        const data = await crm_reports_service_1.crmReportsService.salesNotMade(companyId, {
            dateInit, dateEnd, userId,
            queueId: queueId ? Number(queueId) : undefined,
            page: page ? Number(page) : 1,
            perPage: perPage ? Number(perPage) : 10,
        });
        return reply.send(data);
    },
    async reasons(req, reply) {
        const companyId = req.user?.company_id;
        if (!companyId)
            return reply.status(401).send({ error: 'Unauthorized' });
        const data = await crm_reports_service_1.crmReportsService.reasons(companyId);
        return reply.send(data);
    },
    async channels(req, reply) {
        const companyId = req.user?.company_id;
        if (!companyId)
            return reply.status(401).send({ error: 'Unauthorized' });
        const data = await crm_reports_service_1.crmReportsService.channels(companyId);
        return reply.send(data);
    },
    async updateSale(req, reply) {
        const companyId = req.user?.company_id;
        if (!companyId)
            return reply.status(401).send({ error: 'Unauthorized' });
        const { ticketId } = req.params;
        const { isSale, salePrice, reasonId } = req.body;
        const ok = await crm_reports_service_1.crmReportsService.updateSale(Number(ticketId), companyId, {
            isSale: Boolean(isSale),
            salePrice: salePrice ?? null,
            reasonId: reasonId ? Number(reasonId) : null,
        });
        if (!ok)
            return reply.status(404).send({ error: 'Ticket não encontrado' });
        return reply.send({ ok: true });
    },
};
//# sourceMappingURL=crm-reports.controller.js.map