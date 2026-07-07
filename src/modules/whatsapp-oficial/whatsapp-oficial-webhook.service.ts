import { promises as fs } from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { getRedisClient } from '../../config/redis';
import { db } from '../../database/client';
import { emitToCompany } from '../../shared/socket';
import {
    atendimento_messages, connection_errors_log, Connection,
} from '../atendimento/atendimento.db.schema';
import { graphDownloadBinary } from './graph-api.client';
import { whatsappOficialService } from './whatsapp-oficial.service';

/**
 * Processa os webhooks que a META envia (POST /wabcloudapi/webhook):
 *   value.messages  → mensagem recebida do cliente
 *   value.statuses  → ACK das mensagens enviadas (sent/delivered/read/failed)
 */

const DEDUP_TTL = 10; // s — a Meta reenvia webhooks; ignora duplicados recentes

// ── Tipos do payload da Meta (parcial, só o que usamos) ──────────────────────

type WabMessage = {
    from: string;
    id: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    image?: { id?: string; caption?: string; mime_type?: string };
    video?: { id?: string; caption?: string; mime_type?: string };
    audio?: { id?: string; mime_type?: string };
    sticker?: { id?: string; mime_type?: string };
    document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
    location?: { latitude?: number; longitude?: number; name?: string };
    contacts?: unknown[];
    reaction?: { emoji?: string };
    button?: { text?: string; payload?: string };
    interactive?: {
        type?: string;
        button_reply?: { id?: string; title?: string };
        list_reply?: { id?: string; title?: string };
    };
    referral?: { source_type?: string; source_url?: string; headline?: string };
};

type WabStatus = {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed' | string;
    recipient_id?: string;
    errors?: { code?: number; title?: string; message?: string }[];
};

type WabValue = {
    messaging_product?: string;
    metadata?: { display_phone_number?: string; phone_number_id?: string };
    contacts?: { profile?: { name?: string }; wa_id?: string }[];
    messages?: WabMessage[];
    statuses?: WabStatus[];
};

// ── Funções puras (testáveis) ────────────────────────────────────────────────

/** Mapeia o status da Meta para a escala de ack usada na UI. */
export function mapStatusToAck(status: string): number {
    switch (status) {
        case 'sent':      return 2;
        case 'delivered': return 3;
        case 'read':      return 4;
        case 'failed':    return 0;
        default:          return 1; // pending
    }
}

/** Extrai texto exibível + referência de mídia de uma mensagem da Cloud API. */
export function extractMessageContent(msg: WabMessage): {
    body: string;
    mediaId?: string;
    mediaType?: string;
    mimeType?: string;
    filename?: string;
} {
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
export function resolveOrigin(msg: WabMessage): string {
    if (msg.referral?.source_url || msg.referral?.source_type) {
        const kind = msg.referral.source_type === 'ad' ? 'Anúncio' : (msg.referral.source_type ?? 'Anúncio');
        return `${kind}: ${msg.referral.headline ?? msg.referral.source_url ?? ''}`.trim();
    }
    return 'WhatsApp Oficial';
}

function extFromMime(mime?: string): string {
    const map: Record<string, string> = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
        'video/mp4': 'mp4', 'video/3gpp': '3gp',
        'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
        'application/pdf': 'pdf',
    };
    const clean = (mime ?? '').split(';')[0].trim();
    return map[clean] ?? (clean.split('/')[1] || 'bin');
}

// ── Service ──────────────────────────────────────────────────────────────────

export const whatsappOficialWebhookService = {

    /** Entrada única: roteia todas as mudanças do corpo enviado pela Meta. */
    async handleWebhookBody(body: unknown): Promise<void> {
        const root = body as { object?: string; entry?: { changes?: { field?: string; value?: WabValue }[] }[] };
        if (root?.object !== 'whatsapp_business_account') return;

        for (const entry of root.entry ?? []) {
            for (const change of entry.changes ?? []) {
                const value = change.value;
                if (!value) continue;
                try {
                    if (value.messages?.length) {
                        for (const msg of value.messages) {
                            await this.handleIncomingMessage(value, msg);
                        }
                    }
                    if (value.statuses?.length) {
                        await this.handleStatuses(value);
                    }
                } catch (err: any) {
                    console.error('[WAB webhook] Erro ao processar evento:', err.message);
                }
            }
        }
    },

    // ── Mensagem recebida do cliente ─────────────────────────────────────────

    async handleIncomingMessage(value: WabValue, msg: WabMessage): Promise<void> {
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId || !msg?.id || !msg?.from) return;

        // Deduplicação: a Meta reenvia webhooks se a resposta demorar
        const redis = getRedisClient();
        if (redis) {
            const added = await redis.set(`wab:dedup:${msg.id}:${phoneNumberId}`, '1', 'EX', DEDUP_TTL, 'NX');
            if (!added) return;
        }

        // Descarta reentregas antigas (mais de 24h)
        const ts = Number(msg.timestamp ?? 0) * 1000;
        if (ts && Date.now() - ts > 24 * 60 * 60 * 1000) return;

        const conn = await whatsappOficialService.findConnectionByPhoneNumberId(phoneNumberId);
        if (!conn) {
            console.warn(`[WAB webhook] Nenhuma conexão para phone_number_id ${phoneNumberId}`);
            return;
        }
        const companyId = conn.company_id;

        const contactNumber = msg.from.replace(/\D/g, '');
        const contactName = value.contacts?.[0]?.profile?.name || contactNumber;

        const { body, mediaId, mediaType, mimeType, filename } = extractMessageContent(msg);
        if (!body && !mediaId) return; // nada persistível (ex.: tipo não suportado)

        // Mensagem já persistida? (reentrega além da janela do Redis)
        const [dup] = await db.select({ id: atendimento_messages.id })
            .from(atendimento_messages)
            .where(eq(atendimento_messages.wab_message_id, msg.id))
            .limit(1);
        if (dup) return;

        const { contactService } = await import('../atendimento/contact.service');
        const { ticketService } = await import('../atendimento/ticket.service');
        const { messageService } = await import('../atendimento/message.service');

        const contact = await contactService.findOrCreate(companyId, contactNumber, contactName);

        const { ticket } = await ticketService.findOrCreateOpen(
            companyId,
            contact.id,
            conn.id,
            undefined,
            resolveOrigin(msg),
        );

        emitToCompany(companyId, 'contact:upserted', { contact });

        // Mídia: a Meta manda só o media_id — resolve URL temporária, baixa e serve local
        let mediaUrl: string | undefined;
        if (mediaId) {
            mediaUrl = await this.downloadMedia(conn, mediaId, msg.id, mimeType, filename) ?? undefined;
        }

        // Pesquisa em andamento captura a resposta antes de virar mensagem comum
        const { pesquisaService } = await import('../pesquisas/pesquisa.service');
        const wasAnswer = await pesquisaService.tryRecordAnswer(companyId, contact.id, body).catch(() => false);
        if (wasAnswer) return;

        const saved = await messageService.save(ticket.id, contact.id, body, false, companyId, {
            mediaType: mediaType,
            mediaUrl,
        });
        await db.update(atendimento_messages)
            .set({ wab_message_id: msg.id })
            .where(eq(atendimento_messages.id, saved.id))
            .catch(() => {});

        // Chatbot: mesmo fluxo do Baileys — o executor envia pela própria conexão
        if (body) {
            const { chatbotExecutorService } = await import('../bots/chatbot-executor.service');
            chatbotExecutorService.execute(companyId, conn.id, contactNumber, body, ticket.id)
                .catch((err: Error) => console.error('[WAB ChatbotExecutor] Falha silenciosa:', err.message));
        }
    },

    /** Baixa a mídia (2 etapas: resolve URL → download autenticado) e serve via /uploads. */
    async downloadMedia(
        conn: Connection,
        mediaId: string,
        wamid: string,
        mimeType?: string,
        filename?: string,
    ): Promise<string | null> {
        try {
            const info = await whatsappOficialService.getMediaUrl(conn, mediaId);
            if (!info?.url || !conn.wab_token) return null;

            const { buffer, contentType } = await graphDownloadBinary(info.url, conn.wab_token);
            const ext = filename?.includes('.')
                ? filename.split('.').pop()!
                : extFromMime(info.mime_type ?? mimeType ?? contentType);

            const dir = path.join(process.cwd(), 'uploads', 'wab');
            await fs.mkdir(dir, { recursive: true });
            const safeName = `${wamid.replace(/[^\w.-]/g, '_')}.${ext}`;
            await fs.writeFile(path.join(dir, safeName), buffer);

            return `/uploads/wab/${safeName}`;
        } catch (err: any) {
            console.error(`[WAB:${conn.id}] Erro ao baixar mídia ${mediaId}:`, err.message);
            return null;
        }
    },

    // ── Status de entrega (ACK) ──────────────────────────────────────────────

    async handleStatuses(value: WabValue): Promise<void> {
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) return;

        const conn = await whatsappOficialService.findConnectionByPhoneNumberId(phoneNumberId);
        if (!conn) return;

        for (const st of value.statuses ?? []) {
            if (!st?.id) continue;

            const [msg] = await db.select()
                .from(atendimento_messages)
                .where(eq(atendimento_messages.wab_message_id, st.id))
                .limit(1);
            if (!msg) continue;

            const newAck = mapStatusToAck(st.status);

            if (st.status === 'failed') {
                // Falha de entrega: registra o erro para diagnóstico e notifica o painel
                const metaErr = st.errors?.[0];
                await db.insert(connection_errors_log).values({
                    connection_id: conn.id,
                    error_type: 'wab_message_failed',
                    error_code: metaErr?.code ?? null,
                    error_message: metaErr?.message ?? metaErr?.title ?? `Falha ao entregar wamid ${st.id}`,
                    complete_error: JSON.stringify(st),
                }).catch(() => {});
                emitToCompany(conn.company_id, 'message:ack', {
                    messageId: msg.id, ticketId: msg.ticket_id, ack: 0, failed: true,
                });
                continue;
            }

            // Nunca regride o status (webhooks podem chegar fora de ordem)
            if (newAck <= (msg.ack ?? 0)) continue;

            await db.update(atendimento_messages)
                .set({ ack: newAck })
                .where(eq(atendimento_messages.id, msg.id));

            emitToCompany(conn.company_id, 'message:ack', {
                messageId: msg.id, ticketId: msg.ticket_id, ack: newAck,
            });
        }
    },
};
