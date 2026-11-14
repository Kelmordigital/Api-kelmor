import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Registry } from 'prom-client';
import type { MetricsHistoryService } from './metrics-history.service';
import type { GrafanaAlertService, GrafanaWebhookBody } from './grafana-alert.service';
import type { MetricsAccess } from './metrics-access';

export class MonitoringController {
    constructor(
        private readonly history: MetricsHistoryService,
        private readonly alerts: GrafanaAlertService,
        private readonly access: MetricsAccess,
        private readonly registry: Registry,
    ) {}

    /** GET /metrics — raspado pelo coletor (Alloy). */
    metrics = async (req: FastifyRequest, reply: FastifyReply) => {
        const decision = this.access.decide(req.headers.authorization);
        if (decision === 'hidden') return reply.callNotFound();
        if (decision === 'unauthorized') return reply.status(401).send({ error: 'unauthorized' });
        reply.header('content-type', this.registry.contentType);
        return this.registry.metrics();
    };

    /** POST /monitoring/alert — webhook do Grafana Cloud; responde na hora e avisa em segundo plano. */
    grafanaAlert = async (req: FastifyRequest, reply: FastifyReply) => {
        if (!this.alerts.authorize(req.headers.authorization)) return reply.status(401).send({ error: 'unauthorized' });
        this.alerts.notify(req.body as GrafanaWebhookBody | undefined);
        return reply.send({ ok: true });
    };

    /** GET /api/v1/superadmin/metrics/history — servido pelo painel do Super Admin. */
    metricsHistory = async (req: FastifyRequest, reply: FastifyReply) => {
        const { metric, range } = (req.query ?? {}) as { metric?: unknown; range?: unknown };
        return reply.send(await this.history.history(metric, range));
    };
}
