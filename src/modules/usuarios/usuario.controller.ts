import type { FastifyRequest, FastifyReply } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { companyIdOf } from '../../core/http/http-router';
import { createUserSchema, updateUserSchema, userIdParamsSchema } from './usuario.dto';
import type { Actor, UsuarioService } from './usuario.service';

/** Adapta HTTP ⇄ UsuarioService. */
export class UsuarioController {
    constructor(private readonly service: UsuarioService) {}

    listSelects = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.options(companyIdOf(req)));

    list = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.service.list(companyIdOf(req)));

    create = async (req: FastifyRequest, reply: FastifyReply) => {
        const input = SchemaValidator.parse(createUserSchema, req.body);
        return reply.status(201).send(await this.service.create(this.actor(req), input));
    };

    update = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(userIdParamsSchema, req.params);
        await this.service.update(this.actor(req), id, SchemaValidator.parse(updateUserSchema, req.body));
        return reply.send({ ok: true });
    };

    remove = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(userIdParamsSchema, req.params);
        await this.service.remove(this.actor(req), id);
        return reply.send({ ok: true });
    };

    private actor(req: FastifyRequest): Actor {
        return { userId: req.user.id, companyId: companyIdOf(req) };
    }
}
