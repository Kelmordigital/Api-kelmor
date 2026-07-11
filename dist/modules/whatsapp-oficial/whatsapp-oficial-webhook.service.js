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
exports.whatsappOficialWebhookService = void 0;
exports.mapStatusToAck = mapStatusToAck;
exports.extractMessageContent = extractMessageContent;
exports.resolveOrigin = resolveOrigin;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const drizzle_orm_1 = require("drizzle-orm");
const redis_1 = require("../../config/redis");
const client_1 = require("../../database/client");
const socket_1 = require("../../shared/socket");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const graph_api_client_1 = require("./graph-api.client");
const whatsapp_oficial_service_1 = require("./whatsapp-oficial.service");
/**
 * Processa os webhooks que a META envia (POST /wabcloudapi/webhook):
 *   value.messages  → mensagem recebida do cliente
 *   value.statuses  → ACK das mensagens enviadas (sent/delivered/read/failed)
 */
const DEDUP_TTL = 10; // s — a Meta reenvia webhooks; ignora duplicados recentes
// ── Funções puras (testáveis) ────────────────────────────────────────────────
/** Mapeia o status da Meta para a escala de ack usada na UI. */
function mapStatusToAck(status) {
    switch (status) {
        case 'sent': return 2;
        case 'delivered': return 3;
        case 'read': return 4;
        case 'failed': return 0;
        default: return 1; // pending
    }
}
/** Extrai texto exibível + referência de mídia de uma mensagem da Cloud API. */
function extractMessageContent(msg) {
    switch (msg.type) {
        case 'text':
            return { body: msg.text?.body ?? '' };
        case 'image':
            return { body: msg.image?.caption || '[Imagem]', mediaId: msg.image?.id, mediaType: 'image', mimeType: msg.image?.mime_type };
        case 'video':
            return { body: msg.video?.caption || '[Vídeo]', mediaId: msg.video?.id, mediaType: 'video', mimeType: msg.video?.mime_type };
        case 'audio':
            return { body: '[Áudio]', mediaId: msg.audio?.id, mediaType: 'audio', mimeType: msg.audio?.mime_type };
        case 'sticker':
            return { body: '[Figurinha]', mediaId: msg.sticker?.id, mediaType: 'sticker', mimeType: msg.sticker?.mime_type };
        case 'document':
            return {
                body: msg.document?.caption || msg.document?.filename || '[Documento]',
                mediaId: msg.document?.id, mediaType: 'document',
                mimeType: msg.document?.mime_type, filename: msg.document?.filename,
            };
        case 'location': {
            const loc = msg.location;
            return { body: loc?.name ? `[Localização] ${loc.name}` : '[Localização]' };
        }
        case 'contacts':
            return { body: '[Contato]' };
        case 'reaction':
            return { body: msg.reaction?.emoji ?? '' };
        case 'button':
            // resposta a botão de template
            return { body: msg.button?.text ?? msg.button?.payload ?? '' };
        case 'interactive': {
            const i = msg.interactive;
            const reply = i?.button_reply ?? i?.list_reply;
            return { body: reply?.title ?? reply?.id ?? '' };
        }
        default:
            return { body: '' };
    }
}
/** Origem do ticket: rastreio de anúncio (referral) ou padrão da base. */
function resolveOrigin(msg) {
    if (msg.referral?.source_url || msg.referral?.source_type) {
        const kind = msg.referral.source_type === 'ad' ? 'Anúncio' : (msg.referral.source_type ?? 'Anúncio');
        return `${kind}: ${msg.referral.headline ?? msg.referral.source_url ?? ''}`.trim();
    }
    return 'WhatsApp Oficial';
}
function extFromMime(mime) {
    const map = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
        'video/mp4': 'mp4', 'video/3gpp': '3gp',
        'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
        'application/pdf': 'pdf',
    };
    const clean = (mime ?? '').split(';')[0].trim();
    return map[clean] ?? (clean.split('/')[1] || 'bin');
}
// ── Service ──────────────────────────────────────────────────────────────────
exports.whatsappOficialWebhookService = {
    /** Entrada única: roteia todas as mudanças do corpo enviado pela Meta. */
    async handleWebhookBody(body) {
        const root = body;
        if (root?.object !== 'whatsapp_business_account')
            return;
        for (const entry of root.entry ?? []) {
            for (const change of entry.changes ?? []) {
                const value = change.value;
                if (!value)
                    continue;
                try {
                    if (value.messages?.length) {
                        for (const msg of value.messages) {
                            await this.handleIncomingMessage(value, msg);
                        }
                    }
                    if (value.statuses?.length) {
                        await this.handleStatuses(value);
                    }
                }
                catch (err) {
                    console.error('[WAB webhook] Erro ao processar evento:', err.message);
                }
            }
        }
    },
    // ── Mensagem recebida do cliente ─────────────────────────────────────────
    async handleIncomingMessage(value, msg) {
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId || !msg?.id || !msg?.from)
            return;
        // Deduplicação: a Meta reenvia webhooks se a resposta demorar
        const redis = (0, redis_1.getRedisClient)();
        if (redis) {
            const added = await redis.set(`wab:dedup:${msg.id}:${phoneNumberId}`, '1', 'EX', DEDUP_TTL, 'NX');
            if (!added)
                return;
        }
        // Descarta reentregas antigas (mais de 24h)
        const ts = Number(msg.timestamp ?? 0) * 1000;
        if (ts && Date.now() - ts > 24 * 60 * 60 * 1000)
            return;
        const conn = await whatsapp_oficial_service_1.whatsappOficialService.findConnectionByPhoneNumberId(phoneNumberId);
        if (!conn) {
            console.warn(`[WAB webhook] Nenhuma conexão para phone_number_id ${phoneNumberId}`);
            return;
        }
        const companyId = conn.company_id;
        const contactNumber = msg.from.replace(/\D/g, '');
        const contactName = value.contacts?.[0]?.profile?.name || contactNumber;
        const { body, mediaId, mediaType, mimeType, filename } = extractMessageContent(msg);
        if (!body && !mediaId)
            return; // nada persistível (ex.: tipo não suportado)
        // Mensagem já persistida? (reentrega além da janela do Redis)
        const [dup] = await client_1.db.select({ id: atendimento_db_schema_1.atendimento_messages.id })
            .from(atendimento_db_schema_1.atendimento_messages)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.wab_message_id, msg.id))
            .limit(1);
        if (dup)
            return;
        const { contactService } = await Promise.resolve().then(() => __importStar(require('../atendimento/contact.service')));
        const { ticketService, shouldRunBot } = await Promise.resolve().then(() => __importStar(require('../atendimento/ticket.service')));
        const { messageService } = await Promise.resolve().then(() => __importStar(require('../atendimento/message.service')));
        const contact = await contactService.findOrCreate(companyId, contactNumber, contactName);
        const { ticket } = await ticketService.findOrCreateOpen(companyId, contact.id, conn.id, undefined, resolveOrigin(msg));
        (0, socket_1.emitToCompany)(companyId, 'contact:upserted', { contact });
        // Mídia: a Meta manda só o media_id — resolve URL temporária, baixa e serve local
        let mediaUrl;
        if (mediaId) {
            mediaUrl = await this.downloadMedia(conn, mediaId, msg.id, mimeType, filename) ?? undefined;
        }
        // Pesquisa em andamento captura a resposta antes de virar mensagem comum
        const { pesquisaService } = await Promise.resolve().then(() => __importStar(require('../pesquisas/pesquisa.service')));
        const wasAnswer = await pesquisaService.tryRecordAnswer(companyId, contact.id, body).catch(() => false);
        if (wasAnswer)
            return;
        const saved = await messageService.save(ticket.id, contact.id, body, false, companyId, {
            mediaType: mediaType,
            mediaUrl,
        });
        await client_1.db.update(atendimento_db_schema_1.atendimento_messages)
            .set({ wab_message_id: msg.id })
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.id, saved.id))
            .catch(() => { });
        // Chatbot: mesmo fluxo do Baileys — o executor envia pela própria conexão.
        // Só roda quando o ticket está em status Bot (9) — status_id decide o roteamento.
        if (body && shouldRunBot(ticket)) {
            const { chatbotExecutorService } = await Promise.resolve().then(() => __importStar(require('../bots/chatbot-executor.service')));
            chatbotExecutorService.execute(companyId, conn.id, contactNumber, body, ticket.id)
                .catch((err) => console.error('[WAB ChatbotExecutor] Falha silenciosa:', err.message));
        }
    },
    /** Baixa a mídia (2 etapas: resolve URL → download autenticado) e serve via /uploads. */
    async downloadMedia(conn, mediaId, wamid, mimeType, filename) {
        try {
            const info = await whatsapp_oficial_service_1.whatsappOficialService.getMediaUrl(conn, mediaId);
            if (!info?.url || !conn.wab_token)
                return null;
            const { buffer, contentType } = await (0, graph_api_client_1.graphDownloadBinary)(info.url, conn.wab_token);
            const ext = filename?.includes('.')
                ? filename.split('.').pop()
                : extFromMime(info.mime_type ?? mimeType ?? contentType);
            const dir = path_1.default.join(process.cwd(), 'uploads', 'wab');
            await fs_1.promises.mkdir(dir, { recursive: true });
            const safeName = `${wamid.replace(/[^\w.-]/g, '_')}.${ext}`;
            await fs_1.promises.writeFile(path_1.default.join(dir, safeName), buffer);
            return `/uploads/wab/${safeName}`;
        }
        catch (err) {
            console.error(`[WAB:${conn.id}] Erro ao baixar mídia ${mediaId}:`, err.message);
            return null;
        }
    },
    // ── Status de entrega (ACK) ──────────────────────────────────────────────
    async handleStatuses(value) {
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId)
            return;
        const conn = await whatsapp_oficial_service_1.whatsappOficialService.findConnectionByPhoneNumberId(phoneNumberId);
        if (!conn)
            return;
        for (const st of value.statuses ?? []) {
            if (!st?.id)
                continue;
            const [msg] = await client_1.db.select()
                .from(atendimento_db_schema_1.atendimento_messages)
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.wab_message_id, st.id))
                .limit(1);
            if (!msg)
                continue;
            const newAck = mapStatusToAck(st.status);
            if (st.status === 'failed') {
                // Falha de entrega: registra o erro para diagnóstico e notifica o painel
                const metaErr = st.errors?.[0];
                await client_1.db.insert(atendimento_db_schema_1.connection_errors_log).values({
                    connection_id: conn.id,
                    error_type: 'wab_message_failed',
                    error_code: metaErr?.code ?? null,
                    error_message: metaErr?.message ?? metaErr?.title ?? `Falha ao entregar wamid ${st.id}`,
                    complete_error: JSON.stringify(st),
                }).catch(() => { });
                (0, socket_1.emitToCompany)(conn.company_id, 'message:ack', {
                    messageId: msg.id, ticketId: msg.ticket_id, ack: 0, failed: true,
                });
                continue;
            }
            // Nunca regride o status (webhooks podem chegar fora de ordem)
            if (newAck <= (msg.ack ?? 0))
                continue;
            await client_1.db.update(atendimento_db_schema_1.atendimento_messages)
                .set({ ack: newAck })
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.id, msg.id));
            (0, socket_1.emitToCompany)(conn.company_id, 'message:ack', {
                messageId: msg.id, ticketId: msg.ticket_id, ack: newAck,
            });
        }
    },
};
//# sourceMappingURL=whatsapp-oficial-webhook.service.js.map