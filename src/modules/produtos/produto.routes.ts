import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { produtoController } from './produto.controller';

export async function produtosRoutes(app: FastifyInstance) {
    app.get('/',       { preHandler: authMiddleware }, produtoController.list);
    app.get('/:id',    { preHandler: authMiddleware }, produtoController.findById);
    app.post('/',      { preHandler: authMiddleware }, produtoController.create);
    app.put('/:id',    { preHandler: authMiddleware }, produtoController.update);
    app.delete('/:id', { preHandler: authMiddleware }, produtoController.remove);
}
