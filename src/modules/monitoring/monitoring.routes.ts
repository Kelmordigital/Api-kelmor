import { FastifyInstance } from 'fastify';
import { metricsRegistry } from './monitoring.metrics';

/**
 * Rotas de monitoramento registradas SEM prefixo /api/v1.
 * GET /metrics NÃO tem auth — é bloqueado externamente pelo Nginx e pelo
 * bind 127.0.0.1 da porta 3003; o Alloy raspa pela rede interna do Docker.
 */
export async function monitoringRoutes(app: FastifyInstance) {
    app.get('/metrics', async (_req, reply) => {
        reply.header('content-type', metricsRegistry.contentType);
        return metricsRegistry.metrics();
    });
}
