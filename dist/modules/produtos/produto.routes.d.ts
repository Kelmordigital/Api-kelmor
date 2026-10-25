import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { ProdutoController } from './produto.controller';
/** CRUD do catálogo de produtos — restrito a admin/superAdmin. */
export declare class ProdutoRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: ProdutoController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=produto.routes.d.ts.map