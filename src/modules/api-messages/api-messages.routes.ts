import { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import { apiMessagesController } from './api-messages.controller';

export async function apiMessagesRoutes(app: FastifyInstance) {
    // Pública — autenticação própria por X-Api-Key, nunca por JWT de usuário.
    app.post('/api-messages/send', apiMessagesController.send);

    // Gestão da chave — JWT de usuário admin (mesmo padrão de Configurações Gerais).
    const admin = { preHandler: [authMiddleware, requireAdmin] };
    app.get('/company-api-keys/status',     admin, apiMessagesController.status);
    app.post('/company-api-keys/generate',  admin, apiMessagesController.generate);
    app.delete('/company-api-keys',         admin, apiMessagesController.revoke);
}
