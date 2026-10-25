import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CupomService } from './cupom.service';
/** Adapta HTTP ⇄ CupomService: extrai/valida entrada e escolhe o status. */
export declare class CupomController {
    private readonly service;
    constructor(service: CupomService);
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=cupom.controller.d.ts.map