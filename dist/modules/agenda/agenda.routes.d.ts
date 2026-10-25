import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { AgendaController } from './agenda.controller';
/** Agenda da empresa — restrita a admin/superAdmin. */
export declare class AgendaRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: AgendaController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=agenda.routes.d.ts.map