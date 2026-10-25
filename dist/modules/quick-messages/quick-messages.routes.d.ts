import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { QuickMessageController } from './quick-messages.controller';
/** Mensagens rápidas — qualquer usuário autenticado da empresa. */
export declare class QuickMessageRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: QuickMessageController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=quick-messages.routes.d.ts.map