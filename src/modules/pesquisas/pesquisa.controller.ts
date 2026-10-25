import type { FastifyRequest, FastifyReply } from 'fastify';
import { BadRequestError } from '../../core/errors/http-errors';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { companyIdOf } from '../../core/http/http-router';
import {
    createResearchSchema, reportQuerySchema, reportViewQuerySchema, researchIdParamsSchema, updateResearchSchema,
} from './pesquisa.dto';
import type { ResearchCatalogService, ResearchReportService } from './pesquisa.service';

/** Adapta HTTP ⇄ cadastro e relatório de pesquisas. */
export class PesquisaController {
    constructor(
        private readonly catalog: ResearchCatalogService,
        private readonly reports: ResearchReportService,
    ) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.catalog.list(companyIdOf(req)));

    listActive = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.catalog.listActive(companyIdOf(req)));

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = SchemaValidator.parse(createResearchSchema, req.body);
        return reply.status(201).send(await this.catalog.create(companyIdOf(req), input));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(researchIdParamsSchema, req.params);
        await this.catalog.update(id, companyIdOf(req), SchemaValidator.parse(updateResearchSchema, req.body));
        return reply.send({ ok: true });
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(researchIdParamsSchema, req.params);
        await this.catalog.remove(id, companyIdOf(req));
        return reply.send({ ok: true });
    };

    report = async (req: FastifyRequest, reply: FastifyReply) => {
        const query = SchemaValidator.parse(reportQuerySchema, req.query);
        return reply.send(await this.reports.report(companyIdOf(req), query));
    };

    reportView = async (req: FastifyRequest, reply: FastifyReply) => {
        const raw = req.query as { answerId?: string };
        if (!raw.answerId) throw new BadRequestError('answerId obrigatório');
        const query = SchemaValidator.parse(reportViewQuerySchema, req.query);
        return reply.send(await this.reports.drillDown(companyIdOf(req), query));
    };
}
