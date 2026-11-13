import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import { Pagination } from '../../core/http/pagination';
import {
    FILA_PAGINATION, createFilaSchema, eligibleUsersParamsSchema, filaIdParamsSchema, filaListQuerySchema, updateFilaSchema,
} from './fila.dto';
import type { FilaService, QueueEligibility } from './fila.service';

/** Adapta HTTP ⇄ FilaService. */
export class FilaController {
    constructor(
        private readonly service: FilaService,
        private readonly eligibility: QueueEligibility,
    ) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.list(requireCompanyId(req)));

    search = async (req: FastifyRequest, reply: FastifyReply) => {
        const query = SchemaValidator.parse(filaListQuerySchema, req.query);
        const pagination = Pagination.fromQuery({ page: query.page, limit: query.perPage }, FILA_PAGINATION);
        return reply.send(await this.service.search(requireCompanyId(req), pagination, query.search));
    };

    listForUser = async (req: FastifyRequest, reply: FastifyReply) =>
        reply.send(await this.service.listForUser(requireCompanyId(req), req.user.id));

    listActive = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.listActive(requireCompanyId(req)));

    get = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(filaIdParamsSchema, req.params);
        return reply.send(await this.service.get(id, requireCompanyId(req)));
    };

    eligibleUsers = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id, connectionId } = SchemaValidator.parse(eligibleUsersParamsSchema, req.params);
        return reply.send(await this.eligibility.transferTargets(requireCompanyId(req), id, connectionId));
    };

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const input = SchemaValidator.parse(createFilaSchema, req.body);
        return reply.status(201).send(await this.service.create(companyId, input));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(filaIdParamsSchema, req.params);
        return reply.send(await this.service.update(id, companyId, SchemaValidator.parse(updateFilaSchema, req.body)));
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(filaIdParamsSchema, req.params);
        await this.service.remove(id, companyId);
        return reply.status(204).send();
    };
}
