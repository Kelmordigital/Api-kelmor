import { FastifyRequest, FastifyReply } from 'fastify';
export declare const monitoringController: {
    /**
     * Webhook chamado pelo Grafana Cloud quando um alerta dispara/resolve.
     * Responde 200 imediatamente; o envio do WhatsApp segue em background —
     * se falhar, apenas loga (o e-mail fatal é o fallback garantido).
     */
    handleGrafanaAlert(req: FastifyRequest, reply: FastifyReply): Promise<undefined>;
};
//# sourceMappingURL=monitoring.controller.d.ts.map