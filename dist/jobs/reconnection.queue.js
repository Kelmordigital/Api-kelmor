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
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueReconnect = enqueueReconnect;
exports.startReconnectionWorker = startReconnectionWorker;
const bullmq_1 = require("bullmq");
const env_1 = require("../config/env");
const QUEUE_NAME = 'wa-reconnect';
function getBullMQConnection() {
    if (!env_1.env.REDIS_URL)
        throw new Error('REDIS_URL não configurado');
    const url = new URL(env_1.env.REDIS_URL);
    return {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password || undefined,
        db: Number(url.pathname.slice(1)) || 0,
        maxRetriesPerRequest: null, // obrigatório para BullMQ
    };
}
let _queue = null;
function getQueue() {
    if (!_queue) {
        _queue = new bullmq_1.Queue(QUEUE_NAME, { connection: getBullMQConnection() });
    }
    return _queue;
}
async function enqueueReconnect(connectionId) {
    if (!env_1.env.REDIS_URL)
        return;
    const queue = getQueue();
    await queue.add('reconnect', { connectionId }, {
        jobId: `reconnect:${connectionId}`, // deduplicação: ignora se já existe
        delay: Math.floor(Math.random() * 30_000), // jitter 0-30s
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 }, // 5s, 10s, 20s, 40s, 80s
    });
}
function startReconnectionWorker() {
    if (!env_1.env.REDIS_URL) {
        console.warn('[reconnect] REDIS_URL não configurado — worker desabilitado');
        return null;
    }
    const worker = new bullmq_1.Worker(QUEUE_NAME, async (job) => {
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../modules/whatsapp/whatsapp.service')));
        const { connectionId } = job.data;
        await whatsappService.connect(connectionId);
    }, {
        connection: getBullMQConnection(),
        limiter: { max: 30, duration: 60_000 }, // max 30 reconexões por minuto
    });
    worker.on('failed', (job, err) => {
        if (job)
            console.error(`[reconnect:${job.data?.connectionId}] Falhou:`, err.message);
    });
    console.log('[reconnect] Worker iniciado (limiter: 30/min, jitter: 0-30s)');
    return worker;
}
//# sourceMappingURL=reconnection.queue.js.map