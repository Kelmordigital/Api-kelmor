import { secretsMatch, bearerToken } from '../../core/auth/secret';

export type GrafanaAlert = {
    status: 'firing' | 'resolved';
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    startsAt?: string;
};

export type GrafanaWebhookBody = { alerts?: GrafanaAlert[] };

/** RN-MON-02: no máximo 5 alertas por mensagem. */
const MAX_ALERTS = 5;

/** RN-MON-02: mensagem de WhatsApp a partir do payload do webhook do Grafana. */
export function formatAlertMessage(body: GrafanaWebhookBody | undefined): string | null {
    const alerts = Array.isArray(body?.alerts) ? body.alerts.slice(0, MAX_ALERTS) : [];
    if (alerts.length === 0) return null;

    const lines = alerts.map((a) => {
        const emoji = a.status === 'resolved' ? '✅'
            : a.labels?.severity === 'critical' ? '🚨' : '⚠️';
        const name = a.labels?.alertname ?? 'Alerta';
        const summary = a.annotations?.summary ?? '';
        const since = a.startsAt
            ? new Date(a.startsAt).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            })
            : '';
        return [`${emoji} *${name}*`, summary, since ? `Desde: ${since}` : '']
            .filter(Boolean)
            .join('\n');
    });

    return `🔔 ALERTA — Kelmor\n\n${lines.join('\n\n')}`;
}

/** Para onde os alertas vão: conexão de WhatsApp e telefone. */
export interface AlertDestination {
    connectionId: number;
    phone: string;
}

/** Envia o texto do alerta (WhatsApp). */
export interface AlertSender {
    send(destination: AlertDestination, text: string): Promise<unknown>;
}

export interface AlertSettings {
    /** Token que o Grafana manda em `Authorization: Bearer`. */
    webhookToken?: string;
    destination: AlertDestination | null;
}

/** RN-MON-01 e 02: recebe o webhook do Grafana e avisa pelo WhatsApp. */
export class GrafanaAlertService {
    constructor(
        private readonly sender: AlertSender,
        private readonly settings: () => AlertSettings,
        private readonly log: (message: string) => void = (m) => console.error(m),
    ) {}

    /** Só aceita quem manda o token configurado (sem token configurado, ninguém). */
    authorize(authorization: string | undefined): boolean {
        const { webhookToken } = this.settings();
        return Boolean(webhookToken) && secretsMatch(bearerToken(authorization), webhookToken!);
    }

    /**
     * Dispara o envio sem esperar: quem chamou responde na hora ao Grafana.
     * Falha no envio só é registrada (o e-mail do Grafana é o aviso garantido).
     */
    notify(body: GrafanaWebhookBody | undefined): void {
        const text = formatAlertMessage(body);
        const { destination } = this.settings();
        if (!text || !destination) return;
        this.sender.send(destination, text)
            .catch((err: unknown) => this.log(`[monitoring] Falha ao enviar alerta no WhatsApp: ${(err as Error)?.message}`));
    }
}
