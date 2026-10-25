import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { IntegracaoController } from './integracao.controller';
/** Integração Google Calendar — gestão só de admin; callback é público. */
export declare class IntegracaoRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: IntegracaoController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=integracao.routes.d.ts.map