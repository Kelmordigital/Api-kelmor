"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegracaoRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** Integração Google Calendar — gestão só de admin; callback é público. */
class IntegracaoRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        const adminOnly = { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireAdmin] };
        app.get('/google/auth-url', adminOnly, this.controller.getAuthUrl);
        app.get('/google/status', adminOnly, this.controller.getStatus);
        app.delete('/google', adminOnly, this.controller.disconnect);
        // Público: redirect de OAuth do Google (sem bearer token); a segurança é o state assinado
        app.get('/google/callback', this.controller.callback);
    };
}
exports.IntegracaoRouter = IntegracaoRouter;
//# sourceMappingURL=integracao.routes.js.map