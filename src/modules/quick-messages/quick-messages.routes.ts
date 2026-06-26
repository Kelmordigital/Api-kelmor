import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { quickMessagesController } from './quick-messages.controller';

export async function quickMessagesRoutes(app: FastifyInstance) {
    const auth = { preHandler: authMiddleware };

    app.get('/',       auth, quickMessagesController.list);
    app.post('/',      auth, quickMessagesController.create);
    app.put('/:id',    auth, quickMessagesController.update);
    app.delete('/:id', auth, quickMessagesController.remove);
}
