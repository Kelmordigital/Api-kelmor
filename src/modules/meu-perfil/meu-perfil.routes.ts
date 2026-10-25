import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { MeuPerfilController } from './meu-perfil.controller';

// Rotas do "meu perfil" — acessíveis a QUALQUER papel autenticado (admin ou
// atendente), diferente do módulo `usuarios` (admin-only). Nunca recebem
// `:id`: sempre operam sobre req.user.id, então não há risco de um usuário
// ler/editar o perfil de outro.
export class MeuPerfilRouter implements HttpRouter {
    constructor(private readonly controller: MeuPerfilController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);

        app.get('/',        this.controller.getProfile);
        app.get('/selects', this.controller.listSelects);
        app.put('/',        this.controller.updateProfile);
        app.post('/avatar', this.controller.uploadAvatar);
    };
}
