import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { PesquisaController } from './pesquisa.controller';

/** Cadastro e relatório de pesquisas — restrito a admin/superAdmin. */
export class PesquisaRouter implements HttpRouter {
    constructor(private readonly controller: PesquisaController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireAdmin);
        const c = this.controller;

        app.get('/active',      c.listActive);
        app.get('/',            c.list);
        app.post('/',           c.create);
        app.put('/:id',         c.update);
        app.delete('/:id',      c.remove);

        // Relatório
        app.get('/report',      c.report);
        app.get('/report/view', c.reportView);
    };
}
