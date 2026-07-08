import { env } from '../../config/env';

/**
 * Cliente HTTP mínimo da Graph API da Meta (WhatsApp Cloud API).
 * Toda comunicação com a API Oficial é REST contra graph.facebook.com,
 * autenticada por `Authorization: Bearer <wab_token>`.
 */

const GRAPH_BASE = () => `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;

export class GraphApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly metaError?: unknown,
    ) {
        super(message);
        this.name = 'GraphApiError';
    }

    /** 400/401 da Meta = token/sessão inválidos → conexão precisa ser refeita */
    get isAuthError(): boolean {
        return this.status === 400 || this.status === 401;
    }
}

async function parseError(res: Response, path: string): Promise<never> {
    let metaError: unknown;
    let detail = '';
    try {
        const body = await res.json() as { error?: { message?: string } };
        metaError = body?.error ?? body;
        detail = body?.error?.message ?? '';
    } catch { /* corpo não-JSON */ }
    throw new GraphApiError(
        `Graph API ${path} → ${res.status}${detail ? `: ${detail}` : ''}`,
        res.status,
        metaError,
    );
}

export async function graphGet<T = any>(path: string, token: string): Promise<T> {
    const res = await fetch(`${GRAPH_BASE()}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) await parseError(res, `GET ${path}`);
    return res.json() as Promise<T>;
}

export async function graphPost<T = any>(path: string, token: string, body: unknown): Promise<T> {
    const res = await fetch(`${GRAPH_BASE()}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) await parseError(res, `POST ${path}`);
    return res.json().catch(() => ({} as T)) as Promise<T>;
}

export async function graphDelete<T = any>(path: string, token: string): Promise<T> {
    const res = await fetch(`${GRAPH_BASE()}${path}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) await parseError(res, `DELETE ${path}`);
    return res.json().catch(() => ({} as T)) as Promise<T>;
}

/** Baixa um binário autenticado (URLs temporárias de mídia da lookaside.fbsbx.com). */
export async function graphDownloadBinary(url: string, token: string): Promise<{ buffer: Buffer; contentType: string }> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new GraphApiError(`Download de mídia → ${res.status}`, res.status);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    return { buffer, contentType };
}
