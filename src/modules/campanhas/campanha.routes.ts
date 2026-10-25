import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { CampanhaController } from './campanha.controller';

/**
 * Campanhas (mensagens agendadas) e textos de agendamento — gestão só de
 * admin/superAdmin. Ler os textos é liberado a qualquer usuário da empresa:
 * o atendente escolhe um deles no modal "Agendar mensagem" do atendimento.
 */
export class CampanhaRouter implements HttpRouter {
    constructor(private readonly controller: CampanhaController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        const c = this.controller;
        const admin = { preHandler: requireAdmin };

        // Rotas literais antes das com /:id
        app.get('/texts',               c.listTexts);
        app.post('/texts',       admin, c.createText);
        app.put('/texts/:id',    admin, c.updateText);
        app.delete('/texts/:id', admin, c.removeText);

        app.get('/selects',      admin, c.getSelects);
        app.get('/',             admin, c.list);
        app.post('/',            admin, c.create);
        app.put('/:id',          admin, c.update);
        app.delete('/:id',       admin, c.remove);
        app.post('/:id/play',    admin, c.play);
        app.post('/:id/pause',   admin, c.pause);
    };
}
