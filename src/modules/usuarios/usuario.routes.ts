import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { usuarioController } from './usuario.controller';

export async function usuariosRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authMiddleware);

    app.get('/selects', usuarioController.listSelects);
    app.get('/', usuarioController.list);
    app.post('/', usuarioController.create);
    app.put('/:id', usuarioController.update);
    app.delete('/:id', usuarioController.remove);
}
