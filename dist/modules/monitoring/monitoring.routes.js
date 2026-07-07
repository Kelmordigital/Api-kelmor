"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitoringRoutes = monitoringRoutes;
const monitoring_metrics_1 = require("./monitoring.metrics");
const monitoring_controller_1 = require("./monitoring.controller");
/**
 * Rotas de monitoramento registradas SEM prefixo /api/v1.
 * GET /metrics NÃO tem auth — é bloqueado externamente pelo Nginx e pelo
 * bind 127.0.0.1 da porta 3003; o Alloy raspa pela rede interna do Docker.
 */
async function monitoringRoutes(app) {
    app.get('/metrics', async (_req, reply) => {
        reply.header('content-type', monitoring_metrics_1.metricsRegistry.contentType);
        return monitoring_metrics_1.metricsRegistry.metrics();
    });
    app.post('/monitoring/alert', monitoring_controller_1.monitoringController.handleGrafanaAlert);
}
//# sourceMappingURL=monitoring.routes.js.map