import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { AgendamentoMensagensController } from './agendamento-mensagens.controller';

/** Agendar mensagem para o contato de um ticket — qualquer usuário autenticado da empresa. */
export class AgendamentoMensagensRouter implements HttpRouter {
    constructor(private readonly controller: AgendamentoMensagensController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);

        app.post('/tickets/:id/schedule-message',  this.controller.schedule);
        app.get('/tickets/:id/scheduled-messages', this.controller.list);
        // Só enquanto a mensagem aguarda envio (409 depois)
        app.put('/scheduled-messages/:id',         this.controller.update);
        app.delete('/scheduled-messages/:id',      this.controller.cancel);
    };
}
