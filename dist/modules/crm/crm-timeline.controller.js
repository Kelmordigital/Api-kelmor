"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmTimelineController = void 0;
const crm_timeline_service_1 = require("./crm-timeline.service");
exports.crmTimelineController = {
    async getTimeline(req, reply) {
        const { contactId } = req.params;
        const companyId = req.user.company_id;
        try {
            const items = await crm_timeline_service_1.crmTimelineService.getTimeline(Number(contactId), companyId);
            return reply.send(items);
        }
        catch (err) {
            if (err instanceof crm_timeline_service_1.ContactNaoEncontradoError)
                return reply.status(404).send({ error: err.message });
            throw err;
        }
    },
    async addNote(req, reply) {
        const { contactId } = req.params;
        const companyId = req.user.company_id;
        const { body } = req.body;
        if (!body?.trim())
            return reply.status(400).send({ error: 'body obrigatório' });
        try {
            const item = await crm_timeline_service_1.crmTimelineService.addNote(Number(contactId), companyId, req.user.id, body.trim());
            return reply.send(item);
        }
        catch (err) {
            if (err instanceof crm_timeline_service_1.ContactNaoEncontradoError)
                return reply.status(404).send({ error: err.message });
            throw err;
        }
    },
};
//# sourceMappingURL=crm-timeline.controller.js.map