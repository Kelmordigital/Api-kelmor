import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import {
    agendaListQuerySchema, agendamentoIdParamsSchema, createAgendamentoSchema, updateAgendamentoSchema,
} from './agenda.dto';
import { AgendaPeriod } from './agenda-period';
import type { AgendaService } from './agenda.service';

/** Adapta HTTP ⇄ AgendaService: extrai/valida entrada e escolhe o status. */
export class AgendaController {
    constructor(private readonly service: AgendaService) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { start, end } = SchemaValidator.parse(agendaListQuerySchema, req.query);
        return reply.send(await this.service.list(companyId, AgendaPeriod.of(start, end)));
    };

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const input = SchemaValidator.parse(createAgendamentoSchema, req.body);
        return reply.status(201).send(await this.service.create(companyId, req.user.id, input));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(agendamentoIdParamsSchema, req.params);
        const input = SchemaValidator.parse(updateAgendamentoSchema, req.body);
        return reply.send(await this.service.update(id, companyId, input));
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(agendamentoIdParamsSchema, req.params);
        await this.service.remove(id, companyId);
        return reply.status(204).send();
    };
}
