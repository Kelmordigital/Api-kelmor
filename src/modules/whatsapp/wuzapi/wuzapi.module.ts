import { env } from '../../../config/env';
import { WuzapiClient } from './wuzapi.client';
import { WuzapiCredentials } from './wuzapi-credentials';
import { fixWuzapiMediaUrl } from './wuzapi-event-translator';

/** Tipo de conexão (at_connections.type) atendido pela WuzAPI. */
export const WUZAPI_CONNECTION_TYPE = 'wuzapi';

/**
 * Conexões forçadas para a WuzAPI pela variável WUZAPI_CONNECTION_IDS (ex.: "5,12"),
 * mesmo com outro type no banco. Serve para migrar uma conexão existente sem
 * mexer no banco e voltar atrás só removendo a variável.
 */
const forcedIds = new Set(
    (env.WUZAPI_CONNECTION_IDS ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
);

/** Tipo efetivo da conexão, considerando o override por variável. */
export function effectiveConnectionType(id: number, type: string | null | undefined): string | null {
    if (forcedIds.has(Number(id))) return WUZAPI_CONNECTION_TYPE;
    return type ?? null;
}

export function usesWuzapi(id: number, type: string | null | undefined): boolean {
    return effectiveConnectionType(id, type) === WUZAPI_CONNECTION_TYPE;
}

/**
 * Composition root da WuzAPI. Fica `null` quando as variáveis não estão
 * configuradas: a API sobe normal e só as conexões do tipo wuzapi falham,
 * com mensagem clara.
 */
function build(): { client: WuzapiClient; credentials: WuzapiCredentials } | null {
    const { WUZAPI_URL, WUZAPI_ADMIN_TOKEN, WUZAPI_SECRET, WUZAPI_WEBHOOK_BASE_URL } = env;
    if (!WUZAPI_URL || !WUZAPI_ADMIN_TOKEN || !WUZAPI_SECRET || !WUZAPI_WEBHOOK_BASE_URL) return null;

    const { R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL } = env;
    const s3 = R2_ENDPOINT && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_URL
        ? { endpoint: R2_ENDPOINT, bucket: R2_BUCKET, accessKey: R2_ACCESS_KEY_ID, secretKey: R2_SECRET_ACCESS_KEY, publicUrl: R2_PUBLIC_URL }
        : undefined;

    const credentials = new WuzapiCredentials(WUZAPI_SECRET);
    const client = new WuzapiClient(
        { baseUrl: WUZAPI_URL, adminToken: WUZAPI_ADMIN_TOKEN, webhookBaseUrl: WUZAPI_WEBHOOK_BASE_URL, s3 },
        credentials,
    );
    return { client, credentials };
}

const built = build();

export const wuzapiModule = {
    isConfigured: built !== null,
    /** Endereço público da mídia recebida, sem o bucket que a WuzAPI coloca a mais. */
    mediaUrl(url: string): string {
        return fixWuzapiMediaUrl(url, env.R2_PUBLIC_URL, env.R2_BUCKET);
    },
    /** Lança erro claro quando a WuzAPI não está configurada neste ambiente. */
    get client(): WuzapiClient {
        if (!built) throw new Error('WuzAPI não configurada (WUZAPI_URL, WUZAPI_ADMIN_TOKEN, WUZAPI_SECRET, WUZAPI_WEBHOOK_BASE_URL)');
        return built.client;
    },
    get credentials(): WuzapiCredentials {
        if (!built) throw new Error('WuzAPI não configurada');
        return built.credentials;
    },
};
