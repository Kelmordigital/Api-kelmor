"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiMessagesRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
class ApiMessagesRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        // Pública — autenticação própria por X-Api-Key, nunca por JWT de usuário.
        app.post('/api-messages/send', this.controller.send);
        // Gestão da chave — JWT de usuário admin.
        const admin = { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireAdmin] };
        app.get('/company-api-keys/status', admin, this.controller.status);
        app.post('/company-api-keys/generate', admin, this.controller.generate);
        app.delete('/company-api-keys', admin, this.controller.revoke);
    };
}
exports.ApiMessagesRouter = ApiMessagesRouter;
//# sourceMappingURL=api-messages.routes.js.map