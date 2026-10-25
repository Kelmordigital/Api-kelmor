import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { UsuarioController } from './usuario.controller';

/** Gestão de usuários da empresa — restrita a admin/superAdmin. */
export class UsuarioRouter implements HttpRouter {
    constructor(private readonly controller: UsuarioController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireAdmin);

        app.get('/selects', this.controller.listSelects);
        app.get('/',        this.controller.list);
        app.post('/',       this.controller.create);
        app.put('/:id',     this.controller.update);
        app.delete('/:id',  this.controller.remove);
    };
}
