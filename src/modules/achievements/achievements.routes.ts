import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { AchievementsController } from './achievements.controller';

export class AchievementsRouter implements HttpRouter {
    constructor(private readonly controller: AchievementsController) {}

    register = async (app: FastifyInstance) => {
        // Progresso é sempre do próprio usuário logado (req.user.id) — qualquer
        // papel pode ler o seu (atendente precisa ver a própria barra de XP no
        // atendimento). Só concluir missão (mapa de Conquistas) fica admin-only,
        // já que só admin/superAdmin acessam essa tela hoje.
        app.get('/progress',  { preHandler: authMiddleware }, this.controller.getProgress);
        app.post('/complete', { preHandler: [authMiddleware, requireAdmin] }, this.controller.complete);
    };
}
