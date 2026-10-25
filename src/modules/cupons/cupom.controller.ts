import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { companyIdOf } from '../../core/http/http-router';
import { cupomIdParamsSchema, cupomInputSchema } from './cupom.dto';
import type { CupomService } from './cupom.service';

/** Adapta HTTP ⇄ CupomService: extrai/valida entrada e escolhe o status. */
export class CupomController {
    constructor(private readonly service: CupomService) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.send(await this.service.list(companyIdOf(req)));
    };

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = SchemaValidator.parse(cupomInputSchema, req.body);
        return reply.status(201).send(await this.service.create(companyIdOf(req), input));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(cupomIdParamsSchema, req.params);
        const patch = SchemaValidator.parse(cupomInputSchema, req.body);
        return reply.send(await this.service.update(id, companyIdOf(req), patch));
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(cupomIdParamsSchema, req.params);
        await this.service.remove(id, companyIdOf(req));
        return reply.status(204).send();
    };
}
