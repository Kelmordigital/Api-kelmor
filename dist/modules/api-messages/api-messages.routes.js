"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiMessagesRoutes = apiMessagesRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const api_messages_controller_1 = require("./api-messages.controller");
async function apiMessagesRoutes(app) {
    // Pública — autenticação própria por X-Api-Key, nunca por JWT de usuário.
    app.post('/api-messages/send', api_messages_controller_1.apiMessagesController.send);
    // Gestão da chave — JWT de usuário admin (mesmo padrão de Configurações Gerais).
    const admin = { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireAdmin] };
    app.get('/company-api-keys/status', admin, api_messages_controller_1.apiMessagesController.status);
    app.post('/company-api-keys/generate', admin, api_messages_controller_1.apiMessagesController.generate);
    app.delete('/company-api-keys', admin, api_messages_controller_1.apiMessagesController.revoke);
}
//# sourceMappingURL=api-messages.routes.js.map