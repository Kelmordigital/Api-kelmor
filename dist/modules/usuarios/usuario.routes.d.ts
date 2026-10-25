import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { UsuarioController } from './usuario.controller';
/** Gestão de usuários da empresa — restrita a admin/superAdmin. */
export declare class UsuarioRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: UsuarioController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=usuario.routes.d.ts.map