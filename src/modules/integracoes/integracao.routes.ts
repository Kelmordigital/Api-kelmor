import { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import { integracaoController } from './integracao.controller';

export async function integracoesRoutes(app: FastifyInstance) {
    const adminAuth = { preHandler: [authMiddleware, requireAdmin] };
    app.get('/google/auth-url',  adminAuth, integracaoController.getAuthUrl);
    app.get('/google/status',    adminAuth, integracaoController.getStatus);
    app.delete('/google',        adminAuth, integracaoController.disconnect);
    // Público: redirect de OAuth do Google (sem bearer token)
    app.get('/google/callback',  integracaoController.callback);
}
