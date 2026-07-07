"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitoringController = void 0;
const env_1 = require("../../config/env");
const monitoring_service_1 = require("./monitoring.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
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
};
//# sourceMappingURL=monitoring.controller.js.map