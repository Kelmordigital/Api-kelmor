"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitoringController = void 0;
const env_1 = require("../../config/env");
const monitoring_service_1 = require("./monitoring.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const grafana_prom_client_1 = require("./grafana-prom.client");
exports.monitoringController = {
    /**
     * Webhook chamado pelo Grafana Cloud quando um alerta dispara/resolve.
     * Responde 200 imediatamente; o envio do WhatsApp segue em background —
     * se falhar, apenas loga (o e-mail fatal é o fallback garantido).
     */
    async handleGrafanaAlert(req, reply) {
        const auth = req.headers.authorization;
        if (!env_1.env.ALERT_WEBHOOK_TOKEN || auth !== `Bearer ${env_1.env.ALERT_WEBHOOK_TOKEN}`) {
            return reply.status(401).send({ error: 'unauthorized' });
        }
        const text = (0, monitoring_service_1.formatAlertMessage)(req.body);
        reply.send({ ok: true });
        if (text && env_1.env.ALERT_CONNECTION_ID && env_1.env.ALERT_PHONE) {
            whatsapp_service_1.whatsappService
                .sendTextToPhone(Number(env_1.env.ALERT_CONNECTION_ID), env_1.env.ALERT_PHONE, text)
                .catch((err) => console.error('[monitoring] Falha ao enviar alerta no WhatsApp:', err?.message));
        }
    },
    /** Proxy autenticado (superAdmin) para o histórico de métricas do Grafana Cloud. */
    async metricsHistory(req, reply) {
        const { metric, range } = req.query;
        if (!metric || !(metric in grafana_prom_client_1.METRICS)) {
            return reply.status(400).send({ error: 'metric deve ser: cpu, ram, sessions ou http' });
        }
        if (!range || !(range in grafana_prom_client_1.RANGES)) {
            return reply.status(400).send({ error: 'range deve ser: 1h, 24h ou 7d' });
        }
        if (!env_1.env.GRAFANA_PROM_URL || !env_1.env.GRAFANA_PROM_USER || !env_1.env.GRAFANA_PROM_TOKEN) {
            return reply.status(503).send({ error: 'Monitoramento ainda não configurado no servidor' });
        }
        try {
            const data = await (0, grafana_prom_client_1.fetchMetricHistory)(metric, range);
            return reply.send(data);
        }
        catch (err) {
            console.error('[monitoring] Erro ao consultar Grafana Cloud:', err?.message);
            return reply.status(502).send({ error: 'Falha ao consultar métricas' });
        }
    },
};
//# sourceMappingURL=monitoring.controller.js.map