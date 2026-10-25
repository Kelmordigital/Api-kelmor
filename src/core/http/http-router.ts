import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError } from '../errors/http-errors';

/**
 * Contrato de um conjunto de rotas de um módulo. `register` é uma arrow
 * property para poder ser passado direto ao `app.register(...)`.
 */
export interface HttpRouter {
    readonly register: (app: FastifyInstance) => Promise<void>;
}

/** Empresa do usuário autenticado (rotas de empresa exigem company_id). */
export function companyIdOf(req: FastifyRequest): string {
    return req.user.company_id!;
}

/**
 * Empresa do usuário, recusando quem não tem (superAdmin). Para recursos que
 * só existem dentro de uma empresa e ficam abertos ao superAdmin pelo perfil.
 */
export function requireCompanyId(req: FastifyRequest): string {
    if (!req.user.company_id) throw new ForbiddenError('Empresa não encontrada');
    return req.user.company_id;
}
