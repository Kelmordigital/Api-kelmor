import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import { scheduleMessageSchema, scheduledIdParamsSchema, ticketIdParamsSchema, updateScheduledMessageSchema } from './agendamento-mensagens.dto';
import type { AgendamentoMensagensService } from './agendamento-mensagens.service';

/** Adapta HTTP ⇄ AgendamentoMensagensService. */
export class AgendamentoMensagensController {
    constructor(private readonly service: AgendamentoMensagensService) {}

    schedule = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(ticketIdParamsSchema, req.params);
        const input = SchemaValidator.parse(scheduleMessageSchema, req.body);
        return reply.status(201).send(await this.service.create(companyId, id, req.user.id, input));
    };

    list = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(ticketIdParamsSchema, req.params);
        return reply.send(await this.service.listByTicketContact(companyId, id));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(scheduledIdParamsSchema, req.params);
        const input = SchemaValidator.parse(updateScheduledMessageSchema, req.body);
        return reply.send(await this.service.update(companyId, id, input));
    };

    cancel = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { id } = SchemaValidator.parse(scheduledIdParamsSchema, req.params);
        return reply.send(await this.service.cancel(companyId, id));
    };
}
