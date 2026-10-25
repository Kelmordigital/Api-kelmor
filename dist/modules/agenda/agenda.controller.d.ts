import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AgendaService } from './agenda.service';
/** Adapta HTTP ⇄ AgendaService: extrai/valida entrada e escolhe o status. */
export declare class AgendaController {
    private readonly service;
    constructor(service: AgendaService);
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=agenda.controller.d.ts.map