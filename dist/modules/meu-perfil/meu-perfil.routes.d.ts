import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { MeuPerfilController } from './meu-perfil.controller';
export declare class MeuPerfilRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: MeuPerfilController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=meu-perfil.routes.d.ts.map