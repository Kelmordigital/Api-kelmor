import { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import { achievementsController } from './achievements.controller';

export async function achievementsRoutes(app: FastifyInstance) {
    const auth = { preHandler: authMiddleware };
    const adminAuth = { preHandler: [authMiddleware, requireAdmin] };

    // Progresso é sempre do próprio usuário logado (req.user.id) — qualquer
    // papel pode ler o seu (atendente precisa ver a própria barra de XP no
    // atendimento). Só concluir missão (mapa de Conquistas) fica admin-only,
    // já que só admin/superAdmin acessam essa tela hoje.
    app.get('/progress', auth, achievementsController.getProgress);
    app.post('/complete', adminAuth, achievementsController.complete);
}
