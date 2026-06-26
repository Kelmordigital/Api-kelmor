import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { botsController } from './bots.controller';

export async function botsRoutes(app: FastifyInstance) {
    const auth = { preHandler: authMiddleware };

    app.get('/',                     auth, botsController.list);
    app.post('/',                    auth, botsController.create);
    app.put('/:id',                  auth, botsController.update);
    app.delete('/:id',               auth, botsController.remove);
    app.patch('/:id/toggle-active',  auth, botsController.toggleActive);
    app.patch('/:id/set-default',    auth, botsController.setDefault);
    app.get('/:id/nodes',            auth, botsController.getNodes);
    app.post('/:id/nodes/sync',      auth, botsController.syncNodes);
}
