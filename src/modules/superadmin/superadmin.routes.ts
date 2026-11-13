import type { FastifyInstance, RouteHandlerMethod } from 'fastify';
import { AppError } from '../../core/errors/http-errors';
import type { HttpRouter } from '../../core/http/http-router';
import { publicApiErrorBody } from '../../core/http/public-api-error';
import { authMiddleware, requireSuperAdmin } from '../../middlewares/auth.middleware';
import { errorHandler } from '../../middlewares/error.middleware';
import type { SuperadminController } from './superadmin.controller';

/**
 * Painel do superAdmin — todas as rotas são exclusivas dele. Os erros saem no
 * formato `{ statusCode, error, message }`, que a tela do painel já lê.
 */
export class SuperadminRouter implements HttpRouter {
    constructor(
        private readonly controller: SuperadminController,
        /** Histórico de métricas do servidor (módulo monitoring), exibido no mesmo painel. */
        private readonly metricsHistory: RouteHandlerMethod,
    ) {}

    register = async (app: FastifyInstance) => {
        app.setErrorHandler((error, req, reply) => {
            if (error instanceof AppError) return reply.status(error.statusCode).send(publicApiErrorBody(error));
            return errorHandler(error as Error, req, reply);
        });
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireSuperAdmin);

        const c = this.controller;
        app.get('/stats',                  c.stats);
        app.get('/metrics/history',        this.metricsHistory);
        app.get('/companies',              c.listCompanies);
        app.post('/companies',             c.createCompany);
        app.patch('/companies/:id',        c.updateCompany);
        app.patch('/companies/:id/status', c.setCompanyStatus);
        app.patch('/users/:id/approve',    c.approveUser);
        app.patch('/users/:id/revoke',     c.revokeUser);
    };
}
