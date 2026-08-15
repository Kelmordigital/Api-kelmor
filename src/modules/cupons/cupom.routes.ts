import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { cupomController } from './cupom.controller';

export async function cuponsRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authMiddleware);

    app.get('/', cupomController.list);
    app.post('/', cupomController.create);
    app.put('/:id', cupomController.update);
    app.delete('/:id', cupomController.remove);
}
