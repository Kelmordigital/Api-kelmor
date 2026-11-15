import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { DashboardController } from './dashboard.controller';

/** Painel (AdminDashboard) e financeiro — registrado sob /api/v1/atendimento. */
export class DashboardRouter implements HttpRouter {
    constructor(private readonly c: DashboardController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        const c = this.c;

        app.get('/dashboard/sales-by-connection',           c.salesByConnection);
        app.get('/dashboard/sales-by-channel',              c.salesByChannel);
        app.get('/dashboard/top-customers',                 c.topCustomers);
        app.get('/dashboard/not-sales-by-connection',       c.notSalesByConnection);
        app.get('/dashboard/not-sales-by-channel',          c.notSalesByChannel);
        app.get('/dashboard/not-sales-by-reason',           c.notSalesByReason);
        app.get('/dashboard/not-sales-by-reason-over-time', c.notSalesByReasonOverTime);

        app.get('/dashboard/kpis',                  c.kpis);
        app.get('/dashboard/graph',                 c.graph);
        app.get('/dashboard/graph-by-status',       c.graphByStatus);
        app.get('/dashboard/funnel',                c.funnel);
        app.get('/dashboard/movimentos',            c.movimentos);
        app.get('/dashboard/recent',                c.recent);
        app.get('/dashboard/top-attendants',        c.topAttendants);
        app.get('/dashboard/team-performance',      c.teamPerformance);
        app.get('/dashboard/channels',              c.channels);
        app.get('/dashboard/tickets-by-connection', c.ticketsByConnection);

        app.get('/financeiro/kpis',      c.financeiroKpis);
        app.get('/financeiro/evolucao',  c.financeiroEvolucao);
        app.get('/financeiro/origens',   c.financeiroOrigens);
        app.get('/financeiro/historico', c.financeiroHistorico);
        app.get('/financeiro/perdas',    c.financeiroPerdas);
    };
}
