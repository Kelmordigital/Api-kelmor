export type GrafanaAlert = {
    status: 'firing' | 'resolved';
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    startsAt?: string;
};
export type GrafanaWebhookBody = {
    alerts?: GrafanaAlert[];
};
/** Monta a mensagem de WhatsApp a partir do payload do webhook do Grafana. */
export declare function formatAlertMessage(body: GrafanaWebhookBody | undefined): string | null;
//# sourceMappingURL=monitoring.service.d.ts.map