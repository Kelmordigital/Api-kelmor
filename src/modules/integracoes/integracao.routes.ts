import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { IntegracaoController } from './integracao.controller';

/** Integração Google Calendar — gestão só de admin; callback é público. */
export class IntegracaoRouter implements HttpRouter {
    constructor(private readonly controller: IntegracaoController) {}

    register = async (app: FastifyInstance) => {
        const adminOnly = { preHandler: [authMiddleware, requireAdmin] };

        app.get('/google/auth-url', adminOnly, this.controller.getAuthUrl);
        app.get('/google/status',   adminOnly, this.controller.getStatus);
        app.delete('/google',       adminOnly, this.controller.disconnect);
        // Público: redirect de OAuth do Google (sem bearer token); a segurança é o state assinado
        app.get('/google/callback', this.controller.callback);
    };
}
