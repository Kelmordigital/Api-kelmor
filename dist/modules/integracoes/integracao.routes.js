"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integracoesRoutes = integracoesRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const integracao_controller_1 = require("./integracao.controller");
async function integracoesRoutes(app) {
    const adminAuth = { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireAdmin] };
    app.get('/google/auth-url', adminAuth, integracao_controller_1.integracaoController.getAuthUrl);
    app.get('/google/status', adminAuth, integracao_controller_1.integracaoController.getStatus);
    app.delete('/google', adminAuth, integracao_controller_1.integracaoController.disconnect);
    // Público: redirect de OAuth do Google (sem bearer token)
    app.get('/google/callback', integracao_controller_1.integracaoController.callback);
}
//# sourceMappingURL=integracao.routes.js.map