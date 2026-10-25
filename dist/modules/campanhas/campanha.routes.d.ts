import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { CampanhaController } from './campanha.controller';
/**
 * Campanhas (mensagens agendadas) e textos de agendamento — gestão só de
 * admin/superAdmin. Ler os textos é liberado a qualquer usuário da empresa:
 * o atendente escolhe um deles no modal "Agendar mensagem" do atendimento.
 */
export declare class CampanhaRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: CampanhaController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=campanha.routes.d.ts.map