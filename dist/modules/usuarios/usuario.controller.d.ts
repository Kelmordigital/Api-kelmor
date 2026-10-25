import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UsuarioService } from './usuario.service';
/** Adapta HTTP ⇄ UsuarioService. */
export declare class UsuarioController {
    private readonly service;
    constructor(service: UsuarioService);
    listSelects: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    private actor;
}
//# sourceMappingURL=usuario.controller.d.ts.map