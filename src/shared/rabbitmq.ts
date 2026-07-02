import amqp from 'amqplib';
import { env } from '../config/env';

/**
 * Consumidor RabbitMQ dos eventos publicados pelo bays.
 *
 * Aditivo e opcional: só liga quando USE_RABBITMQ=true. O recebimento por
 * webhook HTTP continua funcionando como fallback garantido. Se o broker cair,
 * reconecta a cada 5s; enquanto isso o bays entrega via HTTP.
 *
 * Contrato de payload: o bays publica no exchange `messages` (routing `unified`)
 * o envelope `messagingPayload` = `{ connectionId, payload: { key, bodyMessage,
 * pushName, ... } }`. Aqui transformamos esse envelope para o formato cru que o
 * handleMessagesWebhook já entende (o mesmo do webhook HTTP), sem tocar no bays.
 */

const MESSAGES_EXCHANGE = 'messages';
const MESSAGES_QUEUE = 'kelmor.messages.consumer';
const MESSAGES_ROUTING = 'unified';

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let stopped = false;
let reconnectTimer: NodeJS.Timeout | null = null;

export async function startRabbitConsumer(): Promise<void> {
    if (!env.USE_RABBITMQ) {
        console.log('[rabbitmq] desativado (USE_RABBITMQ=false) — recebimento via HTTP webhook');
        return;
    }
    stopped = false;
    await connect();
}

async function connect(): Promise<void> {
    try {
        connection = await amqp.connect({
            protocol: 'amqp',
            hostname: env.RABBITMQ_URL,
            port: env.RABBITMQ_PORT1,
            username: env.RABBITMQ_USER,
            password: env.RABBITMQ_PASS,
            heartbeat: 15,
        });

        connection.on('error', (err: Error) => console.error('[rabbitmq] erro na conexão:', err.message));
        connection.on('close', () => { if (!stopped) scheduleReconnect(); });

        channel = await connection.createChannel();
        await channel.assertExchange(MESSAGES_EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(MESSAGES_QUEUE, { durable: true });
        await channel.bindQueue(MESSAGES_QUEUE, MESSAGES_EXCHANGE, MESSAGES_ROUTING);
        await channel.prefetch(1);
        await channel.consume(MESSAGES_QUEUE, onMessage, { noAck: false });

        console.log(`[rabbitmq] consumidor ativo na fila "${MESSAGES_QUEUE}"`);
    } catch (err) {
        console.error('[rabbitmq] falha ao conectar:', (err as Error).message);
        if (!stopped) scheduleReconnect();
    }
}

/**
 * Converte o envelope `messagingPayload` do bays para o formato cru do Baileys
 * que o handleMessagesWebhook consome (`{ data: { key, message, pushName, ... } }`).
 * Se o corpo já vier no formato cru (`{ data }`), passa direto.
 */
export function toWebhookBody(body: any): { connectionId: number; webhook: unknown } {
    const connectionId = Number(body?.connectionId ?? body?.id ?? env.BAYS_SESSION_ID);

    // Já é o formato cru (webhook HTTP) → repassa
    if (body?.data?.key) return { connectionId, webhook: body };

    const p = body?.payload;
    if (!p?.key) return { connectionId, webhook: body };

    const raw = {
        key: {
            id:         p.key.id,
            remoteJid:  p.key.remoteJid,
            fromMe:     p.key.fromMe,
            participant: p.key.participant,
            sender_pn:  p.key.senderPn,        // camelCase → snake_case esperado pelo handler
            senderUsername: p.senderUsername,
        },
        pushName:      p.pushName,
        contactUsername: p.contactUsername,
        profileImgUrl: p.profileImgUrl,
        // bodyMessage já vem resolvido pelo bays ('[Imagem]', texto, etc.)
        message:       { conversation: p.bodyMessage ?? '' },
    };
    return { connectionId, webhook: { data: raw } };
}

async function onMessage(msg: amqp.ConsumeMessage | null): Promise<void> {
    if (!msg || !channel) return;
    try {
        const body = JSON.parse(msg.content.toString());
        const { connectionId, webhook } = toWebhookBody(body);
        const { whatsappService } = await import('../modules/whatsapp/whatsapp.service');
        await whatsappService.handleMessagesWebhook(connectionId, webhook);
        channel.ack(msg);
    } catch (err) {
        console.error('[rabbitmq] erro ao processar mensagem:', (err as Error).message);
        // Descarta (não reenfileira em loop) — o bays reenvia via HTTP se necessário
        channel.nack(msg, false, false);
    }
}

function scheduleReconnect(): void {
    channel = null;
    connection = null;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!stopped) connect();
    }, 5000);
}

export async function stopRabbitConsumer(): Promise<void> {
    stopped = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    try { await channel?.close(); } catch { /* ignore */ }
    try { await connection?.close(); } catch { /* ignore */ }
    channel = null;
    connection = null;
}
