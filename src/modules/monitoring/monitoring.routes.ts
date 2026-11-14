import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { MonitoringController } from './monitoring.controller';

/**
 * Rotas de monitoramento, registradas SEM o prefixo /api/v1. Cada uma tem a
 * própria proteção por token (não há usuário logado): /metrics (RN-MON-06) e
 * o webhook do Grafana (RN-MON-01). O histórico do painel fica no router do
 * superadmin.
 */
export class MonitoringRouter implements HttpRouter {
    constructor(private readonly controller: MonitoringController) {}

    register = async (app: FastifyInstance) => {
        app.get('/metrics',           this.controller.metrics);
        app.post('/monitoring/alert', this.controller.grafanaAlert);
    };
}
