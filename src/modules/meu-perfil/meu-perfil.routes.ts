import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { meuPerfilController } from './meu-perfil.controller';

// Rotas do "meu perfil" — acessíveis a QUALQUER papel autenticado (admin ou
// atendente), diferente do módulo `usuarios` (admin-only). Nunca recebem
// `:id`: sempre operam sobre req.user.id, então não há risco de um usuário
// ler/editar o perfil de outro.
export async function meuPerfilRoutes(app: FastifyInstance) {
    app.addHook('preHandler', authMiddleware);

    app.get('/', meuPerfilController.getProfile);
    app.get('/selects', meuPerfilController.listSelects);
    app.put('/', meuPerfilController.updateProfile);
    app.post('/avatar', meuPerfilController.uploadAvatar);
}
