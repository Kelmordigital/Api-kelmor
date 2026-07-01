import { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import { filaController } from './fila.controller';

export async function filasRoutes(app: FastifyInstance) {
    const auth = { preHandler: authMiddleware };
    const adminAuth = { preHandler: [authMiddleware, requireAdmin] };

    // Rotas estáticas antes das paramétricas
    app.get('/',            auth, filaController.list);
    app.get('/all',         auth, filaController.listAll);
    app.get('/userqueue',   auth, filaController.listUserQueues);
    app.get('/activequeue', auth, filaController.listActive);
    app.get('/:id/:connectionId/users', auth, filaController.eligibleUsers);
    app.get('/:id',         auth, filaController.findById);

    app.post('/',      adminAuth, filaController.create);
    app.put('/:id',    adminAuth, filaController.update);
    app.delete('/:id', adminAuth, filaController.remove);
}
