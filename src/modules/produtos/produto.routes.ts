import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { ProdutoController } from './produto.controller';

/** CRUD do catálogo de produtos — restrito a admin/superAdmin. */
export class ProdutoRouter implements HttpRouter {
    constructor(private readonly controller: ProdutoController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireAdmin);

        app.get('/',       this.controller.list);
        app.get('/:id',    this.controller.findById);
        app.post('/',      this.controller.create);
        app.put('/:id',    this.controller.update);
        app.delete('/:id', this.controller.remove);
    };
}
