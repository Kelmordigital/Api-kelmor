import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env';
import { formatAlertMessage, GrafanaWebhookBody } from './monitoring.service';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { fetchMetricHistory, METRICS, RANGES, MetricKey, RangeKey } from './grafana-prom.client';

export const monitoringController = {
    /**
     * Webhook chamado pelo Grafana Cloud quando um alerta dispara/resolve.
     * Responde 200 imediatamente; o envio do WhatsApp segue em background —
     * se falhar, apenas loga (o e-mail fatal é o fallback garantido).
     */
    async handleGrafanaAlert(req: FastifyRequest, reply: FastifyReply) {
        const auth = req.headers.authorization;
        if (!env.ALERT_WEBHOOK_TOKEN || auth !== `Bearer ${env.ALERT_WEBHOOK_TOKEN}`) {
            return reply.status(401).send({ error: 'unauthorized' });
        }

        const text = formatAlertMessage(req.body as GrafanaWebhookBody);
        reply.send({ ok: true });

        if (text && env.ALERT_CONNECTION_ID && env.ALERT_PHONE) {
            whatsappService
                .sendTextToPhone(Number(env.ALERT_CONNECTION_ID), env.ALERT_PHONE, text)
                .catch((err: any) =>
                    console.error('[monitoring] Falha ao enviar alerta no WhatsApp:', err?.message));
        }
    },

    /** Proxy autenticado (superAdmin) para o histórico de métricas do Grafana Cloud. */
    async metricsHistory(req: FastifyRequest, reply: FastifyReply) {
        const { metric, range } = req.query as { metric?: string; range?: string };
        if (!metric || !(metric in METRICS)) {
            return reply.status(400).send({ error: 'metric deve ser: cpu, ram, sessions ou http' });
        }
        if (!range || !(range in RANGES)) {
            return reply.status(400).send({ error: 'range deve ser: 1h, 24h ou 7d' });
        }
        if (!env.GRAFANA_PROM_URL || !env.GRAFANA_PROM_USER || !env.GRAFANA_PROM_TOKEN) {
            return reply.status(503).send({ error: 'Monitoramento ainda não configurado no servidor' });
        }
        try {
            const data = await fetchMetricHistory(metric as MetricKey, range as RangeKey);
            return reply.send(data);
        } catch (err: any) {
            console.error('[monitoring] Erro ao consultar Grafana Cloud:', err?.message);
            return reply.status(502).send({ error: 'Falha ao consultar métricas' });
        }
    },
};
