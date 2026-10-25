import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { AutomaticTagRuleController, EtiquetaController } from './etiqueta.controller';
/** Etiquetas, etiquetas do contato e regras automáticas — qualquer usuário autenticado da empresa. */
export declare class EtiquetaRouter implements HttpRouter {
    private readonly tags;
    private readonly rules;
    constructor(tags: EtiquetaController, rules: AutomaticTagRuleController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=etiqueta.routes.d.ts.map