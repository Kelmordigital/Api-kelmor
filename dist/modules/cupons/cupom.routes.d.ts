import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { CupomController } from './cupom.controller';
/** CRUD de cupons de desconto — restrito a admin/superAdmin. */
export declare class CupomRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: CupomController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=cupom.routes.d.ts.map