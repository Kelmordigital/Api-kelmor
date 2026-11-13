import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { FilaController } from './fila.controller';

/** Filas: qualquer usuário da empresa consulta; só admin cria, edita e exclui. */
export class FilaRouter implements HttpRouter {
    constructor(private readonly controller: FilaController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        const c = this.controller;
        const adminOnly = { preHandler: requireAdmin };

        // Rotas estáticas antes das paramétricas
        app.get('/',            c.list);
        app.get('/all',         c.search);
        app.get('/userqueue',   c.listForUser);
        app.get('/activequeue', c.listActive);
        app.get('/:id/:connectionId/users', c.eligibleUsers);
        app.get('/:id',         c.get);

        app.post('/',      adminOnly, c.create);
        app.put('/:id',    adminOnly, c.update);
        app.delete('/:id', adminOnly, c.remove);
    };
}
