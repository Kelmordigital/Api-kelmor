"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configuracaoGeralRoutes = configuracaoGeralRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const configuracao_geral_controller_1 = require("./configuracao-geral.controller");
async function configuracaoGeralRoutes(app) {
    app.addHook('preHandler', auth_middleware_1.authMiddleware);
    app.get('/', configuracao_geral_controller_1.configuracaoGeralController.get);
    app.put('/', configuracao_geral_controller_1.configuracaoGeralController.update);
}
//# sourceMappingURL=configuracao-geral.routes.js.map