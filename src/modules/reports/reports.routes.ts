import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { ReportsController } from './reports.controller';

/** Registrado em /api/v1/reports — só admin. */
export class ReportsRouter implements HttpRouter {
    constructor(private readonly controller: ReportsController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireAdmin);
        app.get('/tickets/user',   this.controller.ticketsByUser);
        app.get('/ticket/average', this.controller.averageTimes);
    };
}

/** Registrado em /api/v1/reporttickets — só admin. */
export class ReportTicketsRouter implements HttpRouter {
    constructor(private readonly controller: ReportsController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireAdmin);
        app.get('/tickets/clienttickets', this.controller.ticketsByClient);
    };
}
