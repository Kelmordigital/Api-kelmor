import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { AgendamentoMensagensController } from './agendamento-mensagens.controller';
/** Agendar mensagem para o contato de um ticket — qualquer usuário autenticado da empresa. */
export declare class AgendamentoMensagensRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: AgendamentoMensagensController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=agendamento-mensagens.routes.d.ts.map