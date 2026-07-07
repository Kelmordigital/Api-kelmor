import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env';
import { formatAlertMessage, GrafanaWebhookBody } from './monitoring.service';
import { whatsappService } from '../whatsapp/whatsapp.service';

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
};
