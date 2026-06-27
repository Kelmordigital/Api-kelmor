import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { integracaoController } from './integracao.controller';

export async function integracoesRoutes(app: FastifyInstance) {
    app.get('/google/auth-url',  { preHandler: authMiddleware }, integracaoController.getAuthUrl);
    app.get('/google/status',    { preHandler: authMiddleware }, integracaoController.getStatus);
    app.delete('/google',        { preHandler: authMiddleware }, integracaoController.disconnect);
    app.get('/google/callback',  integracaoController.callback);
}
