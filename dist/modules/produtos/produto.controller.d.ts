import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ProdutoService } from './produto.service';
/** Adapta HTTP ⇄ ProdutoService: extrai/valida entrada e escolhe o status. */
export declare class ProdutoController {
    private readonly service;
    constructor(service: ProdutoService);
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    findById: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=produto.controller.d.ts.map