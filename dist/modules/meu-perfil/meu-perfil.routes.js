"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meuPerfilRoutes = meuPerfilRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const meu_perfil_controller_1 = require("./meu-perfil.controller");
// Rotas do "meu perfil" — acessíveis a QUALQUER papel autenticado (admin ou
// atendente), diferente do módulo `usuarios` (admin-only). Nunca recebem
// `:id`: sempre operam sobre req.user.id, então não há risco de um usuário
// ler/editar o perfil de outro.
async function meuPerfilRoutes(app) {
    app.addHook('preHandler', auth_middleware_1.authMiddleware);
    app.get('/', meu_perfil_controller_1.meuPerfilController.getProfile);
    app.get('/selects', meu_perfil_controller_1.meuPerfilController.listSelects);
    app.put('/', meu_perfil_controller_1.meuPerfilController.updateProfile);
    app.post('/avatar', meu_perfil_controller_1.meuPerfilController.uploadAvatar);
}
//# sourceMappingURL=meu-perfil.routes.js.map