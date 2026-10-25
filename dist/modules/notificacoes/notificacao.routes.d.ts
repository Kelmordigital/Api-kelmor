import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { NotificacaoController } from './notificacao.controller';
/** Sino de notificações — cada usuário vê e marca só as suas. */
export declare class NotificacaoRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: NotificacaoController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=notificacao.routes.d.ts.map