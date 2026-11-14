import { env } from '../../config/env';
import { db } from '../../database/client';
import { whatsappService } from '../whatsapp/whatsapp.service';
import { metricsRegistry, whatsappSessionGauges } from './monitoring.metrics';
import { DrizzleConnectionSnapshots } from './monitoring.repository';
import { GrafanaCloudPrometheus } from './prometheus.client';
import { MetricsHistoryService } from './metrics-history.service';
import { GrafanaAlertService, type AlertDestination, type AlertSender } from './grafana-alert.service';
import { MetricsAccess } from './metrics-access';
import { MonitoringController } from './monitoring.controller';
import { MonitoringRouter } from './monitoring.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */

/** Conexão e telefone dos alertas; conexão que não é número = alertas desligados. */
function alertDestination(): AlertDestination | null {
    const connectionId = Number(env.ALERT_CONNECTION_ID);
    if (!Number.isInteger(connectionId) || connectionId <= 0 || !env.ALERT_PHONE) return null;
    return { connectionId, phone: env.ALERT_PHONE };
}

const whatsappAlerts: AlertSender = {
    send: (destination, text) => whatsappService.sendTextToPhone(destination.connectionId, destination.phone, text),
};

whatsappSessionGauges.useSource(new DrizzleConnectionSnapshots(db).read);

const controller = new MonitoringController(
    new MetricsHistoryService(new GrafanaCloudPrometheus(() => ({
        url: env.GRAFANA_PROM_URL, user: env.GRAFANA_PROM_USER, token: env.GRAFANA_PROM_TOKEN,
    }))),
    new GrafanaAlertService(whatsappAlerts, () => ({ webhookToken: env.ALERT_WEBHOOK_TOKEN, destination: alertDestination() })),
    // METRICS_TOKEN ainda não está no schema de config/env.ts (lido direto do ambiente).
    new MetricsAccess(() => ({ token: process.env.METRICS_TOKEN || undefined, production: env.NODE_ENV === 'production' })),
    metricsRegistry,
);

export const monitoringRouter = new MonitoringRouter(controller);
/** Histórico de métricas, servido pelo router do superadmin. */
export const metricsHistoryHandler = controller.metricsHistory;
