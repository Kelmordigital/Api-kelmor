import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { filaController } from './fila.controller';

export async function filasRoutes(app: FastifyInstance) {
    app.get('/',       { preHandler: authMiddleware }, filaController.list);
    app.post('/',      { preHandler: authMiddleware }, filaController.create);
    app.put('/:id',    { preHandler: authMiddleware }, filaController.update);
    app.delete('/:id', { preHandler: authMiddleware }, filaController.remove);
}
