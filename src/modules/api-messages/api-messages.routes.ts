import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { ApiMessagesController } from './api-messages.controller';

export class ApiMessagesRouter implements HttpRouter {
    constructor(private readonly controller: ApiMessagesController) {}

    register = async (app: FastifyInstance) => {
        // Pública — autenticação própria por X-Api-Key, nunca por JWT de usuário.
        app.post('/api-messages/send', this.controller.send);

        // Gestão da chave — JWT de usuário admin.
        const admin = { preHandler: [authMiddleware, requireAdmin] };
        app.get('/company-api-keys/status',    admin, this.controller.status);
        app.post('/company-api-keys/generate', admin, this.controller.generate);
        app.delete('/company-api-keys',        admin, this.controller.revoke);
    };
}
