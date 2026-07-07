import { FastifyInstance } from 'fastify';
/**
 * Rotas de monitoramento registradas SEM prefixo /api/v1.
 * GET /metrics NÃO tem auth — é bloqueado externamente pelo Nginx e pelo
 * bind 127.0.0.1 da porta 3003; o Alloy raspa pela rede interna do Docker.
 */
export declare function monitoringRoutes(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=monitoring.routes.d.ts.map