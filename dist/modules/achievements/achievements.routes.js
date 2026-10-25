"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AchievementsRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
class AchievementsRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        // Progresso é sempre do próprio usuário logado (req.user.id) — qualquer
        // papel pode ler o seu (atendente precisa ver a própria barra de XP no
        // atendimento). Só concluir missão (mapa de Conquistas) fica admin-only,
        // já que só admin/superAdmin acessam essa tela hoje.
        app.get('/progress', { preHandler: auth_middleware_1.authMiddleware }, this.controller.getProgress);
        app.post('/complete', { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireAdmin] }, this.controller.complete);
    };
}
exports.AchievementsRouter = AchievementsRouter;
//# sourceMappingURL=achievements.routes.js.map