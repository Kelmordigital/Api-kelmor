import type { WuzapiCredentials } from './wuzapi-credentials';

/** Eventos que a API assina por conexão (o resto a WuzAPI nem envia). */
export const WUZAPI_SUBSCRIBED_EVENTS = [
    'Message',
    'QR',
    'QRTimeout',
    'PairSuccess',
    'Connected',
    'LoggedOut',
    'TemporaryBan',
    'ConnectFailure',
] as const;

export interface WuzapiS3Config {
    endpoint: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    publicUrl: string;
}

export interface WuzapiClientConfig {
    baseUrl: string;
    adminToken: string;
    /** Base da URL de webhook (a API vista de dentro do cluster). */
    webhookBaseUrl: string;
    /** Bucket onde a WuzAPI grava a mídia recebida; sem ele a mídia não é salva. */
    s3?: WuzapiS3Config;
}

export interface WuzapiSessionStatus {
    connected: boolean;
    loggedIn: boolean;
    jid?: string;
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 15_000;

export class WuzapiError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message);
        this.name = 'WuzapiError';
    }
}

/**
 * Cliente HTTP da WuzAPI. Cada conexão do CRM é um "usuário" WuzAPI, criado
 * sob demanda (ensureUser) com webhook, eventos, HMAC e S3 já configurados.
 * Respostas da WuzAPI vêm como { code, data, success }; aqui devolvemos `data`.
 */
export class WuzapiClient {
    constructor(
        private readonly config: WuzapiClientConfig,
        private readonly credentials: WuzapiCredentials,
        private readonly http: Fetch = fetch,
    ) {}

    webhookUrl(connectionId: number): string {
        return `${this.config.webhookBaseUrl.replace(/\/+$/, '')}/wuzapi/webhook/${connectionId}`;
    }

    // ── Usuários (admin) ──────────────────────────────────────────────────

    /** Garante que a conexão existe como usuário na WuzAPI. Idempotente. */
    async ensureUser(connectionId: number): Promise<void> {
        const name = this.credentials.userName(connectionId);
        const users = await this.request<Array<{ name?: string }>>('GET', '/admin/users', { admin: true });
        if (Array.isArray(users) && users.some((u) => u?.name === name)) return;

        const s3 = this.config.s3;
        await this.request('POST', '/admin/users', {
            admin: true,
            body: {
                name,
                token: this.credentials.token(connectionId),
                webhook: this.webhookUrl(connectionId),
                events: WUZAPI_SUBSCRIBED_EVENTS.join(','),
                hmacKey: this.credentials.hmacKey(connectionId),
                ...(s3
                    ? {
                          s3Config: {
                              enabled: true,
                              endpoint: s3.endpoint,
                              region: 'auto',
                              bucket: s3.bucket,
                              accessKey: s3.accessKey,
                              secretKey: s3.secretKey,
                              pathStyle: true,
                              publicURL: s3.publicUrl,
                              mediaDelivery: 's3',
                              retentionDays: 0,
                          },
                      }
                    : {}),
            },
        });
    }

    // ── Sessão ────────────────────────────────────────────────────────────

    async connect(connectionId: number): Promise<void> {
        await this.request('POST', '/session/connect', {
            connectionId,
            body: { Subscribe: [...WUZAPI_SUBSCRIBED_EVENTS], Immediate: true },
        }).catch((err: WuzapiError) => {
            // Sessão já conectada não é erro para nós
            if (!/already connected/i.test(err.message)) throw err;
        });
    }

    async status(connectionId: number): Promise<WuzapiSessionStatus> {
        const data = await this.request<Record<string, unknown>>('GET', '/session/status', { connectionId });
        return {
            connected: data?.connected === true || data?.Connected === true,
            loggedIn: data?.loggedIn === true || data?.LoggedIn === true,
            jid: typeof data?.jid === 'string' && data.jid ? data.jid : undefined,
        };
    }

    /** QR atual em data URL (PNG base64), ou null se não houver. */
    async qr(connectionId: number): Promise<string | null> {
        const data = await this.request<Record<string, unknown>>('GET', '/session/qr', { connectionId });
        const qr = data?.QRCode;
        return typeof qr === 'string' && qr ? qr : null;
    }

    /** Pede o código de pareamento (alternativa ao QR). Exige sessão conectada e não logada. */
    async pairPhone(connectionId: number, phone: string): Promise<string> {
        const data = await this.request<unknown>('POST', '/session/pairphone', {
            connectionId,
            body: { Phone: phone.replace(/\D/g, '') },
        });
        const parsed = parseMaybeJson(data);
        const code = parsed?.LinkingCode;
        if (typeof code !== 'string' || !code) throw new WuzapiError('WuzAPI não devolveu o código de pareamento');
        return code;
    }

    /** Desconecta e apaga o pareamento (próxima conexão pede QR). */
    async logout(connectionId: number): Promise<void> {
        await this.request('POST', '/session/logout', { connectionId });
    }

    // ── Envio ─────────────────────────────────────────────────────────────

    async sendText(connectionId: number, to: string, text: string): Promise<string | undefined> {
        const data = await this.request<Record<string, unknown>>('POST', '/chat/send/text', {
            connectionId,
            body: { Phone: to, Body: text },
        });
        return typeof data?.Id === 'string' ? data.Id : undefined;
    }

    /**
     * Mídia por URL pública (a WuzAPI baixa). `kind` escolhe o endpoint;
     * documento exige FileName.
     */
    async sendMedia(
        connectionId: number,
        to: string,
        kind: 'image' | 'video' | 'audio' | 'document' | 'sticker',
        url: string,
        opts: { caption?: string; fileName?: string; mimeType?: string } = {},
    ): Promise<void> {
        const field = { image: 'Image', video: 'Video', audio: 'Audio', document: 'Document', sticker: 'Sticker' }[kind];
        const body: Record<string, unknown> = { Phone: to, [field]: url };
        if (opts.caption && (kind === 'image' || kind === 'video' || kind === 'document')) body.Caption = opts.caption;
        if (kind === 'document') {
            body.FileName = opts.fileName || 'arquivo';
            if (opts.mimeType) body.MimeType = opts.mimeType;
        }
        await this.request('POST', `/chat/send/${kind}`, { connectionId, body });
    }

    async sendContact(connectionId: number, to: string, name: string, vcard: string): Promise<void> {
        await this.request('POST', '/chat/send/contact', { connectionId, body: { Phone: to, Name: name, Vcard: vcard } });
    }

    async sendPoll(connectionId: number, to: string, question: string, options: string[]): Promise<void> {
        // A WuzAPI chama o destino de "group", mas aceita qualquer JID
        await this.request('POST', '/chat/send/poll', {
            connectionId,
            body: { group: to, header: question, options, selectableCount: 1 },
        });
    }

    async avatarUrl(connectionId: number, phone: string): Promise<string | null> {
        const data = await this.request<unknown>('POST', '/user/avatar', {
            connectionId,
            body: { Phone: phone, Preview: false },
        });
        const parsed = parseMaybeJson(data);
        const url = parsed?.url ?? parsed?.URL;
        return typeof url === 'string' && url.startsWith('http') ? url : null;
    }

    // ── HTTP ──────────────────────────────────────────────────────────────

    private async request<T = unknown>(
        method: 'GET' | 'POST' | 'DELETE',
        path: string,
        opts: { admin?: boolean; connectionId?: number; body?: unknown },
    ): Promise<T> {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (opts.admin) headers.Authorization = this.config.adminToken;
        else if (opts.connectionId !== undefined) headers.Token = this.credentials.token(opts.connectionId);
        if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let res: Response;
        try {
            res = await this.http(`${this.config.baseUrl.replace(/\/+$/, '')}${path}`, {
                method,
                headers,
                body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
                signal: controller.signal,
            });
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new WuzapiError(`wuzapi ${method} ${path} → sem resposta: ${reason}`);
        } finally {
            clearTimeout(timer);
        }

        const payload = (await res.json().catch(() => null)) as { data?: unknown; error?: unknown } | null;
        if (!res.ok) {
            const detail = typeof payload?.error === 'string' ? `: ${payload.error}` : '';
            throw new WuzapiError(`wuzapi ${method} ${path} → ${res.status}${detail}`, res.status);
        }
        // Rotas /admin devolvem o objeto direto; as demais, envelopado em { data }
        return (payload && 'data' in payload ? payload.data : payload) as T;
    }
}

/** Alguns handlers da WuzAPI devolvem `data` como string JSON. */
function parseMaybeJson(data: unknown): Record<string, unknown> | null {
    if (typeof data === 'string') {
        try { return JSON.parse(data) as Record<string, unknown>; } catch { return null; }
    }
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}
