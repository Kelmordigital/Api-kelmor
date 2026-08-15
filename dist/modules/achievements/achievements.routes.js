"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.achievementsRoutes = achievementsRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const achievements_controller_1 = require("./achievements.controller");
async function achievementsRoutes(app) {
    const auth = { preHandler: auth_middleware_1.authMiddleware };
    const adminAuth = { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireAdmin] };
    // Progresso é sempre do próprio usuário logado (req.user.id) — qualquer
    // papel pode ler o seu (atendente precisa ver a própria barra de XP no
    // atendimento). Só concluir missão (mapa de Conquistas) fica admin-only,
    // já que só admin/superAdmin acessam essa tela hoje.
    app.get('/progress', auth, achievements_controller_1.achievementsController.getProgress);
    app.post('/complete', adminAuth, achievements_controller_1.achievementsController.complete);
}
//# sourceMappingURL=achievements.routes.js.map