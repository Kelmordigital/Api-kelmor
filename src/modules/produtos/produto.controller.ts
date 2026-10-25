import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { companyIdOf } from '../../core/http/http-router';
import { createProdutoSchema, updateProdutoSchema, produtoIdParamsSchema } from './produto.dto';
import type { ProdutoService } from './produto.service';

/** Adapta HTTP ⇄ ProdutoService: extrai/valida entrada e escolhe o status. */
export class ProdutoController {
    constructor(private readonly service: ProdutoService) {}

    list = async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.send(await this.service.list(companyIdOf(req)));
    };

    findById = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(produtoIdParamsSchema, req.params);
        return reply.send(await this.service.findById(id, companyIdOf(req)));
    };

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = SchemaValidator.parse(createProdutoSchema, req.body);
        return reply.status(201).send(await this.service.create(companyIdOf(req), input));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(produtoIdParamsSchema, req.params);
        const input = SchemaValidator.parse(updateProdutoSchema, req.body);
        return reply.send(await this.service.update(id, companyIdOf(req), input));
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(produtoIdParamsSchema, req.params);
        await this.service.remove(id, companyIdOf(req));
        return reply.status(204).send();
    };
}
