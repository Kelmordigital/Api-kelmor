import { createHmac } from 'crypto';
import { secretsMatch } from '../../core/auth/secret';
import type { Connection } from '../atendimento/atendimento.db.schema';
import type { CachedConnectionLookup, CloudMessageStore } from './whatsapp-oficial.repository';

/**
 * Webhooks da Meta (POST /wabcloudapi/webhook):
 *   value.messages → mensagem recebida do cliente
 *   value.statuses → ACK das mensagens enviadas (sent/delivered/read/failed)
 */

// ── Tipos do payload da Meta (parcial, só o que usamos) ──────────────────────

export type WabMessage = {
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

// ── Funções puras ────────────────────────────────────────────────────────────

/** RN-WAB-10: status da Meta na escala de ack do atendimento. */
export function mapStatusToAck(status: string): number {
    switch (status) {
        case 'sent':      return 2;
        case 'delivered': return 3;
        case 'read':      return 4;
        case 'failed':    return 0;
        default:          return 1; // pendente
    }
}

export interface MessageContent {
    body: string;
    mediaId?: string;
    mediaType?: string;
    mimeType?: string;
    filename?: string;
}

/** RN-WAB-09: texto exibível e referência de mídia de uma mensagem da Cloud API. */
export function extractMessageContent(msg: WabMessage): MessageContent {
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
        case 'location':
            return { body: msg.location?.name ? `[Localização] ${msg.location.name}` : '[Localização]' };
        case 'contacts':
            return { body: '[Contato]' };
        case 'reaction':
            return { body: msg.reaction?.emoji ?? '' };
        case 'button': // resposta a botão de template
            return { body: msg.button?.text ?? msg.button?.payload ?? '' };
        case 'interactive': {
            const reply = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
            return { body: reply?.title ?? reply?.id ?? '' };
        }
        default:
            return { body: '' };
    }
}

/** RN-WAB-08: origem do ticket — o anúncio que trouxe o cliente, ou "WhatsApp Oficial". */
export function resolveOrigin(msg: WabMessage): string {
    if (msg.referral?.source_url || msg.referral?.source_type) {
        const kind = msg.referral.source_type === 'ad' ? 'Anúncio' : (msg.referral.source_type ?? 'Anúncio');
        return `${kind}: ${msg.referral.headline ?? msg.referral.source_url ?? ''}`.trim();
    }
    return 'WhatsApp Oficial';
}

// ── Portas ───────────────────────────────────────────────────────────────────

export interface InboundMessage {
    companyId: string;
    connectionId: number;
    number: string;
    name: string;
    origin: string;
    body: string;
    mediaType?: string;
    mediaUrl?: string;
}

/**
 * O atendimento: contato, ticket, pesquisa pendente, mensagem e bot.
 * Devolve a mensagem gravada, ou null se ela respondeu uma pesquisa.
 */
export interface ConversationInbox {
    receive(message: InboundMessage): Promise<{ messageId: number } | null>;
}

/** Baixa a mídia da Meta e devolve o endereço onde ficou guardada (null se falhar). */
export interface InboundMediaStore {
    fetch(conn: Connection, content: MessageContent, wamid: string): Promise<string | null>;
}

/** "Primeira vez que vejo esta chave?" (com validade). */
export interface Deduplicator {
    firstTime(key: string, ttlSeconds: number): Promise<boolean>;
}

export type CompanyEmitter = (companyId: string, event: string, payload: unknown) => void;

export interface WebhookSettings {
    verifyToken: string;
    /** Segredo do app da Meta (assinatura `X-Hub-Signature-256`); vazio = não confere. */
    appSecret: string;
}

/** RN-WAB-08 a 11: eventos que a Meta envia para o webhook. */
export class CloudWebhookService {
    private static readonly DEDUP_SECONDS = 10;
    private static readonly MAX_AGE_MS = 24 * 60 * 60 * 1000;

    constructor(
        private readonly lookup: CachedConnectionLookup,
        private readonly messages: CloudMessageStore,
        private readonly inbox: ConversationInbox,
        private readonly media: InboundMediaStore,
        private readonly dedup: Deduplicator,
        private readonly emit: CompanyEmitter,
        private readonly settings: () => WebhookSettings,
        private readonly now: () => number = () => Date.now(),
        private readonly log: (message: string) => void = (m) => console.error(m),
    ) {}

    /** Handshake ao cadastrar a URL na Meta: devolve o desafio se o token bate. */
    verifySubscription(mode: unknown, token: unknown, challenge: unknown): string | null {
        const { verifyToken } = this.settings();
        if (mode !== 'subscribe' || typeof token !== 'string' || !verifyToken || !secretsMatch(token, verifyToken)) return null;
        return typeof challenge === 'string' ? challenge : '';
    }

    /** RN-WAB-11: com o segredo do app configurado, só passa o corpo assinado pela Meta. */
    isAuthentic(rawBody: string, signature: string | undefined): boolean {
        const { appSecret } = this.settings();
        if (!appSecret) return true;
        if (!signature?.startsWith('sha256=')) return false;
        const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
        return secretsMatch(signature, expected);
    }

    /** Entrada única: percorre todas as mudanças do corpo; erro numa não impede as outras. */
    async handle(body: unknown): Promise<void> {
        const root = body as { object?: string; entry?: { changes?: { value?: WabValue }[] }[] };
        if (root?.object !== 'whatsapp_business_account') return;

        for (const entry of root.entry ?? []) {
            for (const change of entry.changes ?? []) {
                const value = change.value;
                if (!value) continue;
                try {
                    for (const msg of value.messages ?? []) await this.incoming(value, msg);
                    if (value.statuses?.length) await this.statuses(value);
                } catch (err) {
                    this.log(`[WAB webhook] Erro ao processar evento: ${(err as Error).message}`);
                }
            }
        }
    }

    private async incoming(value: WabValue, msg: WabMessage): Promise<void> {
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId || !msg?.id || !msg?.from) return;

        // A Meta reenvia o webhook se a resposta demorar.
        if (!await this.dedup.firstTime(`wab:dedup:${msg.id}:${phoneNumberId}`, CloudWebhookService.DEDUP_SECONDS)) return;

        // Reentregas com mais de 24 h são descartadas.
        const sentAt = Number(msg.timestamp ?? 0) * 1000;
        if (sentAt && this.now() - sentAt > CloudWebhookService.MAX_AGE_MS) return;

        const conn = await this.lookup.find(phoneNumberId);
        if (!conn) {
            this.log(`[WAB webhook] Nenhuma conexão para phone_number_id ${phoneNumberId}`);
            return;
        }

        const content = extractMessageContent(msg);
        if (!content.body && !content.mediaId) return; // tipo não suportado

        // Reentrega depois da janela de deduplicação: a mensagem já foi gravada.
        if (await this.messages.findByWamid(msg.id)) return;

        const number = msg.from.replace(/\D/g, '');
        const mediaUrl = content.mediaId ? await this.media.fetch(conn, content, msg.id) : null;

        const saved = await this.inbox.receive({
            companyId: conn.company_id,
            connectionId: conn.id,
            number,
            name: value.contacts?.[0]?.profile?.name || number,
            origin: resolveOrigin(msg),
            body: content.body,
            mediaType: content.mediaType,
            mediaUrl: mediaUrl ?? undefined,
        });
        if (saved) await this.messages.setWamid(saved.messageId, msg.id).catch(() => {});
    }

    private async statuses(value: WabValue): Promise<void> {
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) return;
        const conn = await this.lookup.find(phoneNumberId);
        if (!conn) return;

        for (const st of value.statuses ?? []) {
            if (!st?.id) continue;
            const msg = await this.messages.findByWamid(st.id);
            if (!msg) continue;

            if (st.status === 'failed') {
                // Falha de entrega: registra para diagnóstico e avisa o painel.
                const metaErr = st.errors?.[0];
                await this.messages.logDeliveryFailure({
                    connectionId: conn.id,
                    code: metaErr?.code ?? null,
                    message: metaErr?.message ?? metaErr?.title ?? `Falha ao entregar wamid ${st.id}`,
                    raw: st,
                }).catch(() => {});
                this.emit(conn.company_id, 'message:ack', { messageId: msg.id, ticketId: msg.ticket_id, ack: 0, failed: true });
                continue;
            }

            // Nunca regride (os webhooks podem chegar fora de ordem).
            const ack = mapStatusToAck(st.status);
            if (ack <= (msg.ack ?? 0)) continue;
            await this.messages.setAck(msg.id, ack);
            this.emit(conn.company_id, 'message:ack', { messageId: msg.id, ticketId: msg.ticket_id, ack });
        }
    }
}
