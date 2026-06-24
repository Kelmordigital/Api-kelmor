import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { whatsappController } from './whatsapp.controller';

export async function whatsappRoutes(app: FastifyInstance) {
    // Sessão padrão (legacy)
    app.get('/status',     { preHandler: authMiddleware }, whatsappController.getStatus);
    app.post('/connect',   { preHandler: authMiddleware }, whatsappController.connect);
    app.delete('/disconnect', { preHandler: authMiddleware }, whatsappController.disconnect);

    // Gerenciamento de múltiplas conexões
    app.get('/connections',                      { preHandler: authMiddleware }, whatsappController.listConnections);
    app.post('/connections',                     { preHandler: authMiddleware }, whatsappController.createConnection);
    app.delete('/connections/:id',               { preHandler: authMiddleware }, whatsappController.removeConnection);
    app.get('/connections/:id/status',           { preHandler: authMiddleware }, whatsappController.getConnectionStatus);
    app.post('/connections/:id/connect',         { preHandler: authMiddleware }, whatsappController.connectConnection);
    app.delete('/connections/:id/disconnect',    { preHandler: authMiddleware }, whatsappController.disconnectConnection);

    // Chats & mensagens
    app.get('/chats',    { preHandler: authMiddleware }, whatsappController.getChats);
    app.get('/messages', { preHandler: authMiddleware }, whatsappController.getMessages);
    app.post('/send',    { preHandler: authMiddleware }, whatsappController.sendMessage);

    // Status das conversas
    app.get('/conversas',                { preHandler: authMiddleware }, whatsappController.getConversas);
    app.patch('/conversas/:phone',       { preHandler: authMiddleware }, whatsappController.updateConversaStatus);
    app.post('/conversas/ensure',        { preHandler: authMiddleware }, whatsappController.ensureConversa);

    // Diagnóstico
    app.get('/health', { preHandler: authMiddleware }, whatsappController.getHealth);
}
