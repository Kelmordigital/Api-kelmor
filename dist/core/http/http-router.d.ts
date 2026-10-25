import type { FastifyInstance, FastifyRequest } from 'fastify';
/**
 * Contrato de um conjunto de rotas de um módulo. `register` é uma arrow
 * property para poder ser passado direto ao `app.register(...)`.
 */
export interface HttpRouter {
    readonly register: (app: FastifyInstance) => Promise<void>;
}
/** Empresa do usuário autenticado (rotas de empresa exigem company_id). */
export declare function companyIdOf(req: FastifyRequest): string;
/**
 * Empresa do usuário, recusando quem não tem (superAdmin). Para recursos que
 * só existem dentro de uma empresa e ficam abertos ao superAdmin pelo perfil.
 */
export declare function requireCompanyId(req: FastifyRequest): string;
//# sourceMappingURL=http-router.d.ts.map