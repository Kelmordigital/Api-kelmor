import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ConfiguracaoGeralService } from './configuracao-geral.service';
/** Adapta HTTP ⇄ ConfiguracaoGeralService. */
export declare class ConfiguracaoGeralController {
    private readonly service;
    constructor(service: ConfiguracaoGeralService);
    get: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=configuracao-geral.controller.d.ts.map