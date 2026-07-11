"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startConnectionHealthJob = startConnectionHealthJob;
exports.initSessionsGauge = initSessionsGauge;
const client_1 = require("../database/client");
const atendimento_db_schema_1 = require("../modules/atendimento/atendimento.db.schema");
const drizzle_orm_1 = require("drizzle-orm");
const whatsapp_service_1 = require("../modules/whatsapp/whatsapp.service");
const env_1 = require("../config/env");
const monitoring_metrics_1 = require("../modules/monitoring/monitoring.metrics");
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
async function runHealthCheck() {
    const rows = await client_1.db
        .select({ id: atendimento_db_schema_1.connections.id, name: atendimento_db_schema_1.connections.name })
        .from(atendimento_db_schema_1.connections)
        .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.status, 'connected'));
    monitoring_metrics_1.whatsappSessionsConnected.set(rows.length);
    // Alimenta métrica desagregada por conexão (1 = conectada, 0 = não aparece aqui)
    for (const conn of rows) {
        monitoring_metrics_1.whatsappSessionsByConnection.set({ connection_id: conn.id, connection_name: conn.name }, 1);
    }
    if (rows.length === 0)
        return;
    for (const conn of rows) {
        try {
            const res = await fetch(`${env_1.env.BAYS_URL}/session/status/${conn.id}`, {
                headers: { secretkey: env_1.env.BAYS_SECRET_KEY },
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
                // bays retornou erro — não atualiza para evitar false positive
                console.warn(`[health:${conn.id}] bays respondeu ${res.status} para "${conn.name}"`);
                continue;
            }
            const data = await res.json();
            const isConnected = data?.status === 'open' || data?.connected === true ||
                data?.state === 'open' || data?.connectionStatus === 'open' ||
                data?.session?.status === 'open';
            if (!isConnected) {
                console.log(`[health:${conn.id}] "${conn.name}" offline no bays — sincronizando DB e notificando frontend`);
                await whatsapp_service_1.whatsappService.handleConnectionUpdate(conn.id, {
                    type: 'disconnected',
                    reason: 'health_check',
                });
            }
        }
        catch (err) {
            // Timeout ou bays inacessível — não marca como desconectado (evita false positive)
            console.warn(`[health:${conn.id}] Erro ao verificar "${conn.name}":`, err.message);
        }
    }
}
function startConnectionHealthJob() {
    const interval = setInterval(() => {
        runHealthCheck().catch((err) => console.error('[health] Erro não capturado:', err));
    }, INTERVAL_MS);
    console.log('[health] Health check iniciado (intervalo: 5min)');
    return interval;
}
/** Inicializa o gauge no boot com a contagem atual do banco (sem pingar o bays). */
async function initSessionsGauge() {
    const rows = await client_1.db
        .select({ id: atendimento_db_schema_1.connections.id, name: atendimento_db_schema_1.connections.name })
        .from(atendimento_db_schema_1.connections)
        .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.status, 'connected'));
    monitoring_metrics_1.whatsappSessionsConnected.set(rows.length);
    for (const conn of rows) {
        monitoring_metrics_1.whatsappSessionsByConnection.set({ connection_id: conn.id, connection_name: conn.name }, 1);
    }
}
//# sourceMappingURL=connection-health.job.js.map