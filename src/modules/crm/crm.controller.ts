import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import { Pagination } from '../../core/http/pagination';
import {
    CRM_REPORT_PAGINATION, contactIdParamsSchema, createKeywordSchema, createReasonSchema, keywordIdParamsSchema,
    noteSchema, reasonIdParamsSchema, salesReportQuerySchema, ticketIdParamsSchema, updateReasonSchema, updateSaleSchema,
} from './crm.dto';
import type { CrmConfigService } from './crm-config.service';
import type { TimelineService } from './crm-timeline.service';
import type { SalesReportService } from './crm-reports.service';

/** Adapta HTTP ⇄ CrmConfigService. */
export class CrmConfigController {
    constructor(private readonly service: CrmConfigService) {}

    listReasons = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.listReasons(requireCompanyId(req)));

    createReason = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        return reply.status(201).send(await this.service.createReason(companyId, SchemaValidator.parse(createReasonSchema, req.body)));
    };

    updateReason = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(reasonIdParamsSchema, req.params);
        return reply.send(await this.service.updateReason(id, companyId, SchemaValidator.parse(updateReasonSchema, req.body ?? {})));
    };

    deleteReason = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(reasonIdParamsSchema, req.params);
        await this.service.deleteReason(id, companyId);
        return reply.send({ ok: true });
    };

    listKeywords = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.listKeywords(requireCompanyId(req)));

    createKeyword = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        return reply.status(201).send(await this.service.createKeyword(companyId, SchemaValidator.parse(createKeywordSchema, req.body)));
    };

    deleteKeyword = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(keywordIdParamsSchema, req.params);
        await this.service.deleteKeyword(id, companyId);
        return reply.send({ ok: true });
    };
}

/** Adapta HTTP ⇄ TimelineService. */
export class CrmTimelineController {
    constructor(private readonly service: TimelineService) {}

    getTimeline = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { contactId } = SchemaValidator.parse(contactIdParamsSchema, req.params);
        return reply.send(await this.service.getTimeline(contactId, companyId));
    };

    addNote = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { contactId } = SchemaValidator.parse(contactIdParamsSchema, req.params);
        const { body } = SchemaValidator.parse(noteSchema, req.body ?? {});
        return reply.send(await this.service.addNote(contactId, companyId, req.user.id, body));
    };
}

/** Adapta HTTP ⇄ SalesReportService. */
export class CrmReportsController {
    constructor(private readonly service: SalesReportService) {}

    salesMade = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { page, perPage, ...filter } = SchemaValidator.parse(salesReportQuerySchema, req.query);
        return reply.send(await this.service.salesMade(companyId, filter, Pagination.fromQuery({ page, limit: perPage }, CRM_REPORT_PAGINATION)));
    };

    salesNotMade = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { page, perPage, ...filter } = SchemaValidator.parse(salesReportQuerySchema, req.query);
        return reply.send(await this.service.salesNotMade(companyId, filter, Pagination.fromQuery({ page, limit: perPage }, CRM_REPORT_PAGINATION)));
    };

    reasons = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.reasons(requireCompanyId(req)));

    channels = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.channels(requireCompanyId(req)));

    updateSale = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { ticketId } = SchemaValidator.parse(ticketIdParamsSchema, req.params);
        await this.service.updateSale(ticketId, companyId, SchemaValidator.parse(updateSaleSchema, req.body ?? {}));
        return reply.send({ ok: true });
    };
}
