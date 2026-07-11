"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphApiError = void 0;
exports.graphGet = graphGet;
exports.graphPost = graphPost;
exports.graphDelete = graphDelete;
exports.graphDownloadBinary = graphDownloadBinary;
const env_1 = require("../../config/env");
/**
 * Cliente HTTP mínimo da Graph API da Meta (WhatsApp Cloud API).
 * Toda comunicação com a API Oficial é REST contra graph.facebook.com,
 * autenticada por `Authorization: Bearer <wab_token>`.
 */
const GRAPH_BASE = () => `https://graph.facebook.com/${env_1.env.META_GRAPH_API_VERSION}`;
class GraphApiError extends Error {
    status;
    metaError;
    constructor(message, status, metaError) {
        super(message);
        this.status = status;
        this.metaError = metaError;
        this.name = 'GraphApiError';
    }
    /** 400/401 da Meta = token/sessão inválidos → conexão precisa ser refeita */
    get isAuthError() {
        return this.status === 400 || this.status === 401;
    }
}
exports.GraphApiError = GraphApiError;
async function parseError(res, path) {
    let metaError;
    let detail = '';
    try {
        const body = await res.json();
        metaError = body?.error ?? body;
        detail = body?.error?.message ?? '';
    }
    catch { /* corpo não-JSON */ }
    throw new GraphApiError(`Graph API ${path} → ${res.status}${detail ? `: ${detail}` : ''}`, res.status, metaError);
}
async function graphGet(path, token) {
    const res = await fetch(`${GRAPH_BASE()}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok)
        await parseError(res, `GET ${path}`);
    return res.json();
}
async function graphPost(path, token, body) {
    const res = await fetch(`${GRAPH_BASE()}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok)
        await parseError(res, `POST ${path}`);
    return res.json().catch(() => ({}));
}
async function graphDelete(path, token) {
    const res = await fetch(`${GRAPH_BASE()}${path}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok)
        await parseError(res, `DELETE ${path}`);
    return res.json().catch(() => ({}));
}
/** Baixa um binário autenticado (URLs temporárias de mídia da lookaside.fbsbx.com). */
async function graphDownloadBinary(url, token) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok)
        throw new GraphApiError(`Download de mídia → ${res.status}`, res.status);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    return { buffer, contentType };
}
//# sourceMappingURL=graph-api.client.js.map