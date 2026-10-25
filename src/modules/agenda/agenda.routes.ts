import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { AgendaController } from './agenda.controller';

/** Agenda da empresa — restrita a admin/superAdmin. */
export class AgendaRouter implements HttpRouter {
    constructor(private readonly controller: AgendaController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireAdmin);

        app.get('/',       this.controller.list);
        app.post('/',      this.controller.create);
        app.put('/:id',    this.controller.update);
        app.delete('/:id', this.controller.remove);
    };
}
