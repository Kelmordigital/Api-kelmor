import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { configuracaoGeralController } from './configuracao-geral.controller';

export async function configuracaoGeralRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authMiddleware);

    app.get('/', configuracaoGeralController.get);
    app.put('/', configuracaoGeralController.update);
}
