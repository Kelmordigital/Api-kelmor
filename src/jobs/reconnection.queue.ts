import { Queue, Worker } from 'bullmq';
import { env } from '../config/env';

const QUEUE_NAME = 'wa-reconnect';

function getBullMQConnection() {
    if (!env.REDIS_URL) throw new Error('REDIS_URL não configurado');
    const url = new URL(env.REDIS_URL);
    return {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password || undefined,
        db: Number(url.pathname.slice(1)) || 0,
        maxRetriesPerRequest: null as null, // obrigatório para BullMQ
    };
}

let _queue: Queue | null = null;

function getQueue(): Queue {
    if (!_queue) {
        _queue = new Queue(QUEUE_NAME, { connection: getBullMQConnection() });
    }
    return _queue;
}

export async function enqueueReconnect(connectionId: number): Promise<void> {
    if (!env.REDIS_URL) return;
    const queue = getQueue();
    await queue.add(
        'reconnect',
        { connectionId },
        {
            jobId: `reconnect:${connectionId}`, // deduplicação: ignora se já existe
            delay: Math.floor(Math.random() * 30_000), // jitter 0-30s
            attempts: 5,
            backoff: { type: 'exponential', delay: 5_000 }, // 5s, 10s, 20s, 40s, 80s
        }
    );
}

export function startReconnectionWorker(): Worker | null {
    if (!env.REDIS_URL) {
        console.warn('[reconnect] REDIS_URL não configurado — worker desabilitado');
        return null;
    }

    const worker = new Worker(
        QUEUE_NAME,
        async (job) => {
            const { whatsappService } = await import('../modules/whatsapp/whatsapp.service');
            const { connectionId } = job.data as { connectionId: number };
            await whatsappService.connect(connectionId);
        },
        {
            connection: getBullMQConnection(),
            limiter: { max: 30, duration: 60_000 }, // max 30 reconexões por minuto
        }
    );

    worker.on('failed', (job, err) => {
        if (job) console.error(`[reconnect:${job.data?.connectionId}] Falhou:`, err.message);
    });

    console.log('[reconnect] Worker iniciado (limiter: 30/min, jitter: 0-30s)');
    return worker;
}
