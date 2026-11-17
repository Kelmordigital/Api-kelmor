/**
 * Tradução dos webhooks da WuzAPI (whatsmeow) para os formatos que o módulo
 * whatsapp já processa vindos do bays (Baileys). Funções puras: sem I/O.
 *
 * Webhook da WuzAPI (WEBHOOK_FORMAT=json):
 *   { type: 'Message' | 'QR' | 'Connected' | ..., event: {...}, s3?: {...}, userID, instanceName }
 *
 * O `event.Message` do whatsmeow é o protobuf do WhatsApp serializado com os
 * mesmos nomes de campo que o Baileys usa (conversation, extendedTextMessage,
 * imageMessage...), então o corpo da mensagem passa adiante sem conversão.
 */

export interface WuzapiWebhook {
    type?: string;
    event?: unknown;
    s3?: { url?: string; mimeType?: string; fileName?: string };
    qrCodeBase64?: string;
    [key: string]: unknown;
}

/** Mesmo formato do corpo de PUT /connection/update/:id que o bays manda. */
export interface ConnectionUpdate {
    type: 'qrcode' | 'connected' | 'disconnected';
    qrCode?: string;
    serializedId?: string;
    code?: number;
    reason?: string;
}

/** Mesmo formato do messages-webhook do bays (só os campos que o handler lê). */
export interface BaileysLikeMessage {
    key: { remoteJid: string; fromMe: boolean; id: string; sender_pn?: string };
    pushName?: string;
    message: Record<string, unknown>;
    media?: { url: string; mimetype?: string; seconds?: number };
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Tipos de mensagem que não viram conversa (controle do protocolo, reações, votos). */
const IGNORED_MESSAGE_KINDS = [
    'protocolMessage',
    'reactionMessage',
    'pollUpdateMessage',
    'senderKeyDistributionMessage',
    'keepInChatMessage',
    'pinInChatMessage',
];

/** Chats que não são conversa 1:1 (grupos são filtrados mais adiante, como hoje). */
function isIgnoredChat(jid: string): boolean {
    return jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter');
}

export function translateMessage(webhook: WuzapiWebhook): BaileysLikeMessage | null {
    if (webhook.type !== 'Message') return null;
    const event = asObj(webhook.event);
    const info = asObj(event.Info);
    const message = asObj(event.Message);

    const chat = str(info.Chat);
    const id = str(info.ID);
    if (!chat || !id || isIgnoredChat(chat)) return null;

    const kinds = Object.keys(message);
    // Só chaves de controle (ex.: messageContextInfo + protocolMessage) → não é conteúdo
    const content = kinds.filter((k) => k !== 'messageContextInfo');
    if (content.length === 0 || content.every((k) => IGNORED_MESSAGE_KINDS.includes(k))) return null;

    const fromMe = info.IsFromMe === true;
    const key: BaileysLikeMessage['key'] = { remoteJid: chat, fromMe, id };

    // Contato por username/LID: o número real, quando a Meta revela, vem no "Alt".
    // Mensagem recebida → SenderAlt; mensagem minha (outro aparelho) → RecipientAlt.
    if (chat.endsWith('@lid')) {
        const alt = str(fromMe ? info.RecipientAlt : info.SenderAlt);
        if (alt.endsWith('@s.whatsapp.net')) key.sender_pn = alt;
    }

    const result: BaileysLikeMessage = { key, message };
    const pushName = str(info.PushName).trim();
    if (pushName) result.pushName = pushName;

    const s3url = str(webhook.s3?.url);
    if (s3url.startsWith('http')) {
        const audio = asObj(message.audioMessage);
        const seconds = typeof audio.seconds === 'number' ? audio.seconds : undefined;
        result.media = {
            url: s3url,
            mimetype: str(webhook.s3?.mimeType) || undefined,
            ...(seconds !== undefined ? { seconds } : {}),
        };
    }
    return result;
}

/**
 * Corrige o endereço público da mídia gravada pela WuzAPI no R2.
 *
 * A WuzAPI 1.1.0 monta `<publicURL>/<bucket>/<chave>`, mas o domínio público do R2 já aponta
 * para dentro do bucket: o endereço certo é `<publicURL>/<chave>`. Com o bucket no meio o R2
 * responde 404 e o CRM mostra "Não foi possível carregar o áudio" (e o mesmo para imagem,
 * vídeo, documento e figurinha). Endereço em outro formato passa sem mudança.
 */
export function fixWuzapiMediaUrl(url: string, publicUrl: string | undefined, bucket: string | undefined): string {
    if (!publicUrl || !bucket) return url;
    const base = publicUrl.replace(/\/+$/, '');
    const wrong = `${base}/${bucket}/`;
    return url.startsWith(wrong) ? `${base}/${url.slice(wrong.length)}` : url;
}

/**
 * Eventos de sessão → atualização de status da conexão.
 * `Disconnected`/`KeepAliveTimeout` são ignorados de propósito: o whatsmeow
 * reconecta sozinho, e marcar "desconectado" dispararia e-mail de queda a cada
 * oscilação de rede. Só o que exige ação humana (logout, ban, QR expirado) derruba.
 */
export function translateConnectionEvent(webhook: WuzapiWebhook): ConnectionUpdate | null {
    const event = asObj(webhook.event);
    switch (webhook.type) {
        case 'QR': {
            const qr = str(webhook.qrCodeBase64);
            return qr ? { type: 'qrcode', qrCode: qr } : null;
        }
        case 'PairSuccess': {
            const jid = str(event.ID);
            return { type: 'connected', ...(jid ? { serializedId: jid } : {}) };
        }
        case 'Connected':
            return { type: 'connected' };
        case 'LoggedOut':
            return { type: 'disconnected', code: 401, reason: `LoggedOut ${str(event.Reason) || String(event.Reason ?? '')}`.trim() };
        case 'TemporaryBan':
            return { type: 'disconnected', code: 403, reason: 'TemporaryBan' };
        case 'ConnectFailure':
            return { type: 'disconnected', code: Number(event.Reason) || undefined, reason: 'ConnectFailure' };
        case 'QRTimeout':
            return { type: 'disconnected', reason: 'QR Code expirou sem leitura' };
        default:
            return null;
    }
}
