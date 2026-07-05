"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startRabbitConsumer = startRabbitConsumer;
exports.toWebhookBody = toWebhookBody;
exports.stopRabbitConsumer = stopRabbitConsumer;
const amqplib_1 = __importDefault(require("amqplib"));
const env_1 = require("../config/env");
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
let connection = null;
let channel = null;
let stopped = false;
let reconnectTimer = null;
async function startRabbitConsumer() {
    if (!env_1.env.USE_RABBITMQ) {
        console.log('[rabbitmq] desativado (USE_RABBITMQ=false) — recebimento via HTTP webhook');
        return;
    }
    stopped = false;
    await connect();
}
async function connect() {
    try {
        connection = await amqplib_1.default.connect({
            protocol: 'amqp',
            hostname: env_1.env.RABBITMQ_URL,
            port: env_1.env.RABBITMQ_PORT1,
            username: env_1.env.RABBITMQ_USER,
            password: env_1.env.RABBITMQ_PASS,
            heartbeat: 15,
        });
        connection.on('error', (err) => console.error('[rabbitmq] erro na conexão:', err.message));
        connection.on('close', () => { if (!stopped)
            scheduleReconnect(); });
        channel = await connection.createChannel();
        await channel.assertExchange(MESSAGES_EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(MESSAGES_QUEUE, { durable: true });
        await channel.bindQueue(MESSAGES_QUEUE, MESSAGES_EXCHANGE, MESSAGES_ROUTING);
        await channel.prefetch(1);
        await channel.consume(MESSAGES_QUEUE, onMessage, { noAck: false });
        console.log(`[rabbitmq] consumidor ativo na fila "${MESSAGES_QUEUE}"`);
    }
    catch (err) {
        console.error('[rabbitmq] falha ao conectar:', err.message);
        if (!stopped)
            scheduleReconnect();
    }
}
/**
 * Converte o envelope `messagingPayload` do bays para o formato cru do Baileys
 * que o handleMessagesWebhook consome (`{ data: { key, message, pushName, ... } }`).
 * Se o corpo já vier no formato cru (`{ data }`), passa direto.
 */
function toWebhookBody(body) {
    const connectionId = Number(body?.connectionId ?? body?.id ?? env_1.env.BAYS_SESSION_ID);
    // Já é o formato cru (webhook HTTP) → repassa
    if (body?.data?.key)
        return { connectionId, webhook: body };
    const p = body?.payload;
    if (!p?.key)
        return { connectionId, webhook: body };
    const raw = {
        key: {
            id: p.key.id,
            remoteJid: p.key.remoteJid,
            fromMe: p.key.fromMe,
            participant: p.key.participant,
            sender_pn: p.key.senderPn, // camelCase → snake_case esperado pelo handler
            senderUsername: p.senderUsername,
        },
        pushName: p.pushName,
        contactUsername: p.contactUsername,
        profileImgUrl: p.profileImgUrl,
        // bodyMessage já vem resolvido pelo bays ('[Imagem]', texto, etc.)
        message: { conversation: p.bodyMessage ?? '' },
    };
    return { connectionId, webhook: { data: raw } };
}
async function onMessage(msg) {
    if (!msg || !channel)
        return;
    try {
        const body = JSON.parse(msg.content.toString());
        const { connectionId, webhook } = toWebhookBody(body);
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../modules/whatsapp/whatsapp.service')));
        await whatsappService.handleMessagesWebhook(connectionId, webhook);
        channel.ack(msg);
    }
    catch (err) {
        console.error('[rabbitmq] erro ao processar mensagem:', err.message);
        // Descarta (não reenfileira em loop) — o bays reenvia via HTTP se necessário
        channel.nack(msg, false, false);
    }
}
function scheduleReconnect() {
    channel = null;
    connection = null;
    if (reconnectTimer)
        return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!stopped)
            connect();
    }, 5000);
}
async function stopRabbitConsumer() {
    stopped = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    try {
        await channel?.close();
    }
    catch { /* ignore */ }
    try {
        await connection?.close();
    }
    catch { /* ignore */ }
    channel = null;
    connection = null;
}
//# sourceMappingURL=rabbitmq.js.map