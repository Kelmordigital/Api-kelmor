import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { NotificacaoController } from './notificacao.controller';

/** Sino de notificações — cada usuário vê e marca só as suas. */
export class NotificacaoRouter implements HttpRouter {
    constructor(private readonly controller: NotificacaoController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);

        app.get('/',          this.controller.list);
        app.post('/read-all', this.controller.markAllRead);
        app.post('/:id/read', this.controller.markRead);
    };
}
