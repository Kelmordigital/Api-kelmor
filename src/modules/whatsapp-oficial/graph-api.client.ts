/**
 * Cliente HTTP da Graph API da Meta (WhatsApp Cloud API). Toda comunicação
 * com a API Oficial é REST contra graph.facebook.com, autenticada por
 * `Authorization: Bearer <token>`.
 */

export class GraphApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly metaError?: unknown,
    ) {
        super(message);
        this.name = 'GraphApiError';
    }

    /** 400/401 da Meta = token/sessão inválidos → conexão precisa ser refeita. */
    get isAuthError(): boolean {
        return this.status === 400 || this.status === 401;
    }
}

export class GraphApiClient {
    /** `version` é lida a cada chamada (ex.: `v21.0`). */
    constructor(private readonly version: () => string) {}

    private url(path: string): string {
        return `https://graph.facebook.com/${this.version()}${path}`;
    }

    async get<T>(path: string, token: string): Promise<T> {
        const res = await fetch(this.url(path), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        if (!res.ok) return GraphApiClient.fail(res, `GET ${path}`);
        return res.json() as Promise<T>;
    }

    async post<T>(path: string, token: string, body: unknown): Promise<T> {
        const res = await fetch(this.url(path), {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) return GraphApiClient.fail(res, `POST ${path}`);
        return res.json().catch(() => ({})) as Promise<T>;
    }

    async delete<T>(path: string, token: string): Promise<T> {
        const res = await fetch(this.url(path), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return GraphApiClient.fail(res, `DELETE ${path}`);
        return res.json().catch(() => ({})) as Promise<T>;
    }

    /** Baixa um binário autenticado (URLs temporárias de mídia da lookaside.fbsbx.com). */
    async download(url: string, token: string): Promise<{ buffer: Buffer; contentType: string }> {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new GraphApiError(`Download de mídia → ${res.status}`, res.status);
        return {
            buffer: Buffer.from(await res.arrayBuffer()),
            contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        };
    }

    /** Troca o `code` OAuth do Embedded Signup por um token de usuário. */
    async exchangeCode(appId: string, appSecret: string, code: string): Promise<string> {
        const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
        const res = await fetch(this.url(`/oauth/access_token?${params}`));
        if (!res.ok) throw new GraphApiError(`Troca do code OAuth falhou (${res.status})`, res.status);
        const { access_token } = await res.json() as { access_token?: string };
        if (!access_token) throw new GraphApiError('Meta não retornou access_token', res.status);
        return access_token;
    }

    private static async fail(res: Response, path: string): Promise<never> {
        let metaError: unknown;
        let detail = '';
        try {
            const body = await res.json() as { error?: { message?: string } };
            metaError = body?.error ?? body;
            detail = body?.error?.message ?? '';
        } catch { /* corpo não-JSON */ }
        throw new GraphApiError(`Graph API ${path} → ${res.status}${detail ? `: ${detail}` : ''}`, res.status, metaError);
    }
}
