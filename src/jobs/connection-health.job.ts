import { db } from '../database/client';
import { connections } from '../modules/atendimento/atendimento.db.schema';
import { eq } from 'drizzle-orm';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { env } from '../config/env';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

async function runHealthCheck() {
    const rows = await db
        .select({ id: connections.id, name: connections.name })
        .from(connections)
        .where(eq(connections.status, 'connected'));

    if (rows.length === 0) return;

    for (const conn of rows) {
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
