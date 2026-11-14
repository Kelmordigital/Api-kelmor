import { db } from '../database/client';
import { connections } from '../modules/atendimento/atendimento.db.schema';
import { eq } from 'drizzle-orm';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { env } from '../config/env';
import { whatsappSessionsConnected, whatsappSessionsByConnection } from '../modules/monitoring/monitoring.metrics';
import { wuzapiModule, usesWuzapi } from '../modules/whatsapp/wuzapi/wuzapi.module';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

async function runHealthCheck() {
    const rows = await db
        .select({ id: connections.id, name: connections.name, type: connections.type })
        .from(connections)
        .where(eq(connections.status, 'connected'));

    whatsappSessionsConnected.set(rows.length);

    // Alimenta métrica desagregada por conexão (1 = conectada, 0 = não aparece aqui)
    for (const conn of rows) {
        whatsappSessionsByConnection.set({ connection_id: conn.id, connection_name: conn.name }, 1);
    }

    if (rows.length === 0) return;

    for (const conn of rows) {
        // Conexão WuzAPI não existe no bays: pergunta à própria WuzAPI
        if (usesWuzapi(conn.id, conn.type)) {
            try {
                const st = await wuzapiModule.client.status(conn.id);
                if (!st.loggedIn) {
                    console.log(`[health:${conn.id}] "${conn.name}" sem login na WuzAPI — sincronizando DB e notificando frontend`);
                    await whatsappService.handleConnectionUpdate(conn.id, { type: 'disconnected', reason: 'health_check' }, { engine: 'wuzapi' });
                }
            } catch (err: any) {
                // WuzAPI inacessível — não marca como desconectado (evita false positive)
                console.warn(`[health:${conn.id}] Erro ao verificar "${conn.name}" na WuzAPI:`, err.message);
            }
            continue;
        }
        try {
            const res = await fetch(`${env.BAYS_URL}/session/status/${conn.id}`, {
                headers: { secretkey: env.BAYS_SECRET_KEY },
                signal: AbortSignal.timeout(10_000),
            });

            if (!res.ok) {
                // bays retornou erro — não atualiza para evitar false positive
                console.warn(`[health:${conn.id}] bays respondeu ${res.status} para "${conn.name}"`);
                continue;
            }

            const data = await res.json() as any;
            const isConnected =
                data?.status === 'open' || data?.connected === true ||
                data?.state === 'open'  || data?.connectionStatus === 'open' ||
                data?.session?.status === 'open';

            if (!isConnected) {
                console.log(`[health:${conn.id}] "${conn.name}" offline no bays — sincronizando DB e notificando frontend`);
                await whatsappService.handleConnectionUpdate(conn.id, {
                    type: 'disconnected',
                    reason: 'health_check',
                });
            }
        } catch (err: any) {
            // Timeout ou bays inacessível — não marca como desconectado (evita false positive)
            console.warn(`[health:${conn.id}] Erro ao verificar "${conn.name}":`, err.message);
        }
    }
}

export function startConnectionHealthJob(): NodeJS.Timeout {
    const interval = setInterval(() => {
        runHealthCheck().catch((err) => console.error('[health] Erro não capturado:', err));
    }, INTERVAL_MS);
    console.log('[health] Health check iniciado (intervalo: 5min)');
    return interval;
}

/** Inicializa o gauge no boot com a contagem atual do banco (sem pingar o bays). */
export async function initSessionsGauge(): Promise<void> {
    const rows = await db
        .select({ id: connections.id, name: connections.name })
        .from(connections)
        .where(eq(connections.status, 'connected'));
    whatsappSessionsConnected.set(rows.length);
    for (const conn of rows) {
        whatsappSessionsByConnection.set({ connection_id: conn.id, connection_name: conn.name }, 1);
    }
}
