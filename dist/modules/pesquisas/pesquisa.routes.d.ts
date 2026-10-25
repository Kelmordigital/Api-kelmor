import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { PesquisaController } from './pesquisa.controller';
/** Cadastro e relatório de pesquisas — restrito a admin/superAdmin. */
export declare class PesquisaRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: PesquisaController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=pesquisa.routes.d.ts.map