import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { ConfiguracaoGeralController } from './configuracao-geral.controller';
export declare class ConfiguracaoGeralRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: ConfiguracaoGeralController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=configuracao-geral.routes.d.ts.map