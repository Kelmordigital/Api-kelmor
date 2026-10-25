import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { TarefasController } from './tarefas.controller';
/** Central de Tarefas — qualquer usuário autenticado, sobre o próprio quadro. */
export declare class TarefasRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: TarefasController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=tarefas.routes.d.ts.map