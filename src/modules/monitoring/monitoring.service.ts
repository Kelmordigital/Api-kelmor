export type GrafanaAlert = {
    status: 'firing' | 'resolved';
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    startsAt?: string;
};

export type GrafanaWebhookBody = { alerts?: GrafanaAlert[] };

/** Monta a mensagem de WhatsApp a partir do payload do webhook do Grafana. */
export function formatAlertMessage(body: GrafanaWebhookBody | undefined): string | null {
    const alerts = Array.isArray(body?.alerts) ? body!.alerts!.slice(0, 5) : [];
    if (alerts.length === 0) return null;

    const lines = alerts.map((a) => {
        const emoji = a.status === 'resolved' ? '✅'
            : a.labels?.severity === 'critical' ? '🚨' : '⚠️';
        const nome = a.labels?.alertname ?? 'Alerta';
        const resumo = a.annotations?.summary ?? '';
        const quando = a.startsAt
            ? new Date(a.startsAt).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            })
            : '';
        return [`${emoji} *${nome}*`, resumo, quando ? `Desde: ${quando}` : '']
            .filter(Boolean)
            .join('\n');
    });

    return `🔔 ALERTA — Kelmor\n\n${lines.join('\n\n')}`;
}
