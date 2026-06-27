import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { pesquisaController } from './pesquisa.controller';

export async function pesquisasRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authMiddleware);

    app.get('/active', pesquisaController.listActive);
    app.get('/', pesquisaController.list);
    app.post('/', pesquisaController.create);
    app.put('/:id', pesquisaController.update);
    app.delete('/:id', pesquisaController.remove);
}
