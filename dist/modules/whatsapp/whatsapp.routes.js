"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappRoutes = whatsappRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const whatsapp_controller_1 = require("./whatsapp.controller");
async function whatsappRoutes(app) {
    // Sessão padrão (legacy)
    app.get('/status', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.getStatus);
    app.post('/connect', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.connect);
    app.delete('/disconnect', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.disconnect);
    // Gerenciamento de múltiplas conexões
    app.get('/connections', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.listConnections);
    app.post('/connections', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.createConnection);
    app.delete('/connections/:id', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.removeConnection);
    app.put('/connections/:id/queues', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.updateConnectionQueues);
    app.get('/connections/:id/status', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.getConnectionStatus);
    app.post('/connections/:id/connect', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.connectConnection);
    app.delete('/connections/:id/disconnect', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.disconnectConnection);
    app.post('/connections/:id/pairing-code', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.requestPairingCode);
    app.post('/connections/:id/web-token', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.generateWebToken);
    app.get('/connections/:id/fingerprint', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.checkConnectionFingerprint);
    // Chats & mensagens
    app.get('/chats', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.getChats);
    app.get('/messages', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.getMessages);
    app.post('/send', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.sendMessage);
    // Status das conversas
    app.get('/conversas', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.getConversas);
    app.patch('/conversas/:phone', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.updateConversaStatus);
    app.post('/conversas/ensure', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.ensureConversa);
    // Extensão de importação de sessão
    app.get('/extension-download', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.downloadExtension);
    // Diagnóstico
    app.get('/health', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_controller_1.whatsappController.getHealth);
}
//# sourceMappingURL=whatsapp.routes.js.map