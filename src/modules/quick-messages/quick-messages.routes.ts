import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { QuickMessageController } from './quick-messages.controller';

/** Mensagens rápidas — qualquer usuário autenticado da empresa. */
export class QuickMessageRouter implements HttpRouter {
    constructor(private readonly controller: QuickMessageController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);

        app.get('/',       this.controller.list);
        app.post('/',      this.controller.create);
        app.put('/:id',    this.controller.update);
        app.delete('/:id', this.controller.remove);
    };
}
