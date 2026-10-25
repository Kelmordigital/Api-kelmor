"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeuPerfilRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
// Rotas do "meu perfil" — acessíveis a QUALQUER papel autenticado (admin ou
// atendente), diferente do módulo `usuarios` (admin-only). Nunca recebem
// `:id`: sempre operam sobre req.user.id, então não há risco de um usuário
// ler/editar o perfil de outro.
class MeuPerfilRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.get('/', this.controller.getProfile);
        app.get('/selects', this.controller.listSelects);
        app.put('/', this.controller.updateProfile);
        app.post('/avatar', this.controller.uploadAvatar);
    };
}
exports.MeuPerfilRouter = MeuPerfilRouter;
//# sourceMappingURL=meu-perfil.routes.js.map