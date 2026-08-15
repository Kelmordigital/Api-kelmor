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
exports.whatsappService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const env_1 = require("../../config/env");
const redis_1 = require("../../config/redis");
const socket_1 = require("../../shared/socket");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const SESSION_ID = env_1.env.BAYS_SESSION_ID;
const STATUS_TTL = 60 * 60 * 24; // 24 hours
const QR_TTL = 180; // 3 minutes
// ── Redis keys por sessão ────────────────────────────────────────────────────
function statusKey(id) { return `wa:status:${id}`; }
function qrKey(id) { return `wa:qr:${id}`; }
function pairingKey(id) { return `wa:pairing:${id}`; }
function convKey(phone) { return `wa:conv:${phone}`; }
function convsSetKey() { return 'wa:conv_phones'; }
// ── Bays HTTP helpers ────────────────────────────────────────────────────────
async function baysGet(path) {
    const url = `${env_1.env.BAYS_URL}${path}`;
    const res = await fetch(url, {
        headers: { secretkey: env_1.env.BAYS_SECRET_KEY, Accept: 'application/json' },
    });
    if (!res.ok)
        throw new Error(`bays GET ${path} → ${res.status}`);
    return res.json();
}
const BAYS_RETRY_ATTEMPTS = 2;
const BAYS_RETRY_DELAY_MS = 1000;
const BAYS_TIMEOUT_MS = 15000;
async function baysPost(path, body) {
    const url = `${env_1.env.BAYS_URL}${path}`;
    for (let attempt = 1; attempt <= BAYS_RETRY_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), BAYS_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: { secretkey: env_1.env.BAYS_SECRET_KEY, 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
        }
        catch (err) {
            // Sem resposta nenhuma (timeout do AbortController ou falha de rede)
            // — o bays as vezes trava (ex.: sessao do Baileys ainda inicializando
            // apos reconectar) e o fetch nunca resolve sozinho. Mesma politica de
            // retry do 5xx: so desiste na ultima tentativa.
            if (attempt >= BAYS_RETRY_ATTEMPTS) {
                const reason = err instanceof Error ? err.message : String(err);
                throw new Error(`bays POST ${path} → sem resposta (timeout/rede): ${reason}`);
            }
            await new Promise((resolve) => setTimeout(resolve, BAYS_RETRY_DELAY_MS));
            continue;
        }
        finally {
            clearTimeout(timeoutId);
        }
        if (res.ok)
            return res.json().catch(() => ({}));
        const detail = await res.json().catch(() => null);
        const reason = detail?.message ? `: ${detail.message}` : '';
        const err = new Error(`bays POST ${path} → ${res.status}${reason}`);
        // Só reincide em erro 5xx (falha transitória do lado do bays — ex.:
        // sessão do Baileys reconectando). Erro 4xx é do payload/requisição
        // em si e tentar de novo não vai mudar o resultado.
        const retryable = res.status >= 500 && attempt < BAYS_RETRY_ATTEMPTS;
        if (!retryable)
            throw err;
        await new Promise((resolve) => setTimeout(resolve, BAYS_RETRY_DELAY_MS));
    }
}
async function baysDelete(path) {
    const url = `${env_1.env.BAYS_URL}${path}`;
    await fetch(url, {
        method: 'DELETE',
        headers: { secretkey: env_1.env.BAYS_SECRET_KEY },
    });
}
// ── Log helper ───────────────────────────────────────────────────────────────
async function logConnectionError(opts) {
    try {
        await client_1.db.insert(atendimento_db_schema_1.connection_errors_log).values({
            connection_id: opts.connectionId,
            error_type: opts.errorType,
            error_code: opts.errorCode ?? null,
            error_message: opts.errorMessage ?? null,
            complete_error: opts.completeError ? JSON.stringify(opts.completeError) : null,
        });
    }
    catch (err) {
        console.error('[WA] Erro ao salvar log de conexão:', err.message);
    }
}
// ── Service ──────────────────────────────────────────────────────────────────
exports.whatsappService = {
    // ── Status & Connection ─────────────────────────────────────────────────
    async getStatus(connectionId) {
        const id = connectionId ?? Number(SESSION_ID);
        const redis = (0, redis_1.getRedisClient)();
        // ── Camada 1: Redis (cache quente, ~1ms) ────────────────────────────
        let cached = await redis?.get(statusKey(id));
        // Migração transparente: chave legada sem sufixo (deployments antigos)
        if (!cached && id === 1 && redis) {
            const legacy = await redis.get('wa:status');
            if (legacy) {
                await redis.set(statusKey(id), legacy, 'EX', STATUS_TTL);
                await redis.del('wa:status');
                cached = legacy;
            }
        }
        if (cached === 'connected') {
            if (redis)
                await redis.expire(statusKey(id), STATUS_TTL);
            return { status: 'connected' };
        }
        if (cached === 'qr_ready') {
            let qr = await redis?.get(qrKey(id)) ?? null;
            // Migração chave legada do QR
            if (!qr && id === 1 && redis) {
                qr = await redis.get('wa:qr');
                if (qr) {
                    await redis.set(qrKey(id), qr, 'EX', QR_TTL);
                    await redis.del('wa:qr');
                }
            }
            return { status: 'qr_ready', qr: qr ?? undefined };
        }
        if (cached === 'pairing_ready') {
            const pairingCode = await redis?.get(pairingKey(id)) ?? undefined;
            return { status: 'pairing_ready', pairingCode: pairingCode ?? undefined };
        }
        if (cached === 'loading_qr' || cached === 'loading_pairing' || cached === 'reconnecting' || cached === 'needs_reauth') {
            return { status: cached };
        }
        // ── Camada 2: Banco de dados (source of truth, ~5ms) ────────────────
        // Redis vazio ou expirado — consulta o banco antes de ir ao bays
        try {
            const { connections } = await Promise.resolve().then(() => __importStar(require('../atendimento/atendimento.db.schema')));
            const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
            const [conn] = await client_1.db
                .select({ status: connections.status, type: connections.type })
                .from(connections)
                .where(eq(connections.id, id))
                .limit(1);
            // API Oficial (Cloud API): não há sessão no bays nem QR — o status é o do
            // banco. Sem esse guard, a confirmação com o bays derrubaria a conexão.
            if (conn?.type === 'whatsapp-oficial') {
                return { status: conn.status ?? 'connected' };
            }
            if (conn?.status === 'connected') {
                // Banco diz conectado → confirma com bays (pode ter caído sem webhook)
                try {
                    const data = await baysGet(`/session/status/${id}`);
                    const isConnected = data?.status === 'open' || data?.connected === true ||
                        data?.state === 'open' || data?.connectionStatus === 'open' ||
                        data?.session?.status === 'open';
                    if (isConnected) {
                        // Reaquece o cache Redis a partir do banco
                        if (redis)
                            await redis.set(statusKey(id), 'connected', 'EX', STATUS_TTL);
                        return { status: 'connected' };
                    }
                    // bays discorda → atualiza banco para refletir realidade
                    await client_1.db.update(connections).set({ status: 'disconnected' }).where(eq(connections.id, id)).catch(() => { });
                }
                catch {
                    // bays inacessível → confia no banco por ora
                    if (redis)
                        await redis.set(statusKey(id), 'connected', 'EX', 300); // TTL curto: 5min
                    return { status: 'connected' };
                }
            }
        }
        catch {
            // Falha no banco → segue para verificação direta
        }
        // ── Camada 3: bays direto (verdade absoluta, ~20ms) ─────────────────
        try {
            const data = await baysGet(`/session/status/${id}`);
            const isConnected = data?.status === 'open' || data?.connected === true ||
                data?.state === 'open' || data?.connectionStatus === 'open' ||
                data?.session?.status === 'open';
            if (isConnected) {
                if (redis)
                    await redis.set(statusKey(id), 'connected', 'EX', STATUS_TTL);
                // Sincroniza banco também
                const { connections } = await Promise.resolve().then(() => __importStar(require('../atendimento/atendimento.db.schema')));
                const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
                await client_1.db.update(connections).set({ status: 'connected' }).where(eq(connections.id, id)).catch(() => { });
                return { status: 'connected' };
            }
        }
        catch {
            // bays indisponível
        }
        // ── Camada 4: credenciais no Redis → reconexão silenciosa ────────────
        if (redis) {
            try {
                const credKeys = await redis.keys(`baileys:auth:${id}:*`);
                if (credKeys.length > 0) {
                    // Lock evita chamar connect() múltiplas vezes quando frontend faz polling
                    const lockKey = `wa:reconnect_lock:${id}`;
                    const acquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');
                    if (acquired) {
                        // Usa fila BullMQ: jitter 0-30s + rate limit 30/min + backoff exponencial
                        const { enqueueReconnect } = await Promise.resolve().then(() => __importStar(require('../../jobs/reconnection.queue')));
                        enqueueReconnect(id).catch((err) => console.error(`[WA:${id}] Erro ao enfileirar reconexão:`, err.message));
                    }
                    await redis.set(statusKey(id), 'reconnecting', 'EX', 60);
                    return { status: 'reconnecting' };
                }
            }
            catch { }
        }
        return { status: 'disconnected' };
    },
    // ── Importar sessão (fingerprint do navegador) ──────────────────────────
    async generateWebToken(connectionId) {
        return baysPost(`/session/web-token/${connectionId}`);
    },
    async checkFingerprint(connectionId) {
        return baysGet(`/session/check-fingerprint/${connectionId}`);
    },
    async connect(connectionId) {
        const id = connectionId ?? Number(SESSION_ID);
        const redis = (0, redis_1.getRedisClient)();
        // Conexão oficial não tem sessão no bays — nada a conectar via QR
        try {
            const { connections } = await Promise.resolve().then(() => __importStar(require('../atendimento/atendimento.db.schema')));
            const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
            const [conn] = await client_1.db.select({ type: connections.type }).from(connections)
                .where(eq(connections.id, id)).limit(1);
            if (conn?.type === 'whatsapp-oficial')
                return;
        }
        catch { }
        const payload = { groups: false, company_id: 1, connection_name: `session-${id}` };
        try {
            await baysPost(`/session/create/${id}`, payload);
            if (redis)
                await redis.set(statusKey(id), 'loading_qr', 'EX', STATUS_TTL);
        }
        catch (err) {
            if (err.message?.includes('→ 400')) {
                // Sessão já existe no bays
                try {
                    const data = await baysGet(`/session/status/${id}`);
                    const isConnected = data?.status === 'open' ||
                        data?.connected === true ||
                        data?.state === 'open' ||
                        data?.connectionStatus === 'open' ||
                        data?.session?.status === 'open';
                    if (isConnected) {
                        if (redis)
                            await redis.set(statusKey(id), 'connected', 'EX', STATUS_TTL);
                        return;
                    }
                }
                catch { }
                if (redis)
                    await redis.set(statusKey(id), 'loading_qr', 'EX', STATUS_TTL);
                await baysDelete(`/session/delete/${id}`).catch(() => { });
                baysPost(`/session/create/${id}`, payload)
                    .catch((e) => console.error(`[WA:${id}] bays reconnect error:`, e.message));
            }
            else {
                console.error(`[WA:${id}] bays connect error:`, err.message);
            }
        }
    },
    async requestPairingCode(connectionId, phoneNumber) {
        const id = connectionId;
        const redis = (0, redis_1.getRedisClient)();
        const payload = { phoneNumber, groups: false, company_id: 1, connection_name: `session-${id}` };
        await baysDelete(`/session/delete/${id}`).catch(() => { });
        await baysPost(`/session/pairing-code/${id}`, payload);
        if (redis)
            await redis.set(statusKey(id), 'loading_pairing', 'EX', STATUS_TTL);
    },
    async disconnect(connectionId) {
        const id = connectionId ?? Number(SESSION_ID);
        const redis = (0, redis_1.getRedisClient)();
        if (redis) {
            await redis.del(statusKey(id));
            await redis.del(qrKey(id));
        }
        await baysDelete(`/session/delete/${id}`).catch(() => { });
    },
    // ── Webhook from bays ───────────────────────────────────────────────────
    async handleConnectionUpdate(connectionId, data) {
        const id = connectionId;
        const redis = (0, redis_1.getRedisClient)();
        if (!redis)
            return;
        if (data.type === 'qrcode' && data.qrCode) {
            await redis.set(qrKey(id), data.qrCode, 'EX', QR_TTL);
            await redis.set(statusKey(id), 'qr_ready', 'EX', STATUS_TTL);
            console.log(`[WA:${id}] QR code received from bays`);
        }
        else if (data.type === 'pairing-code' && data.pairingCode) {
            await redis.set(pairingKey(id), data.pairingCode, 'EX', QR_TTL);
            await redis.set(statusKey(id), 'pairing_ready', 'EX', STATUS_TTL);
            console.log(`[WA:${id}] Pairing code received from bays`);
        }
        else if (data.type === 'connected') {
            await redis.set(statusKey(id), 'connected', 'EX', STATUS_TTL);
            await redis.del(qrKey(id));
            await redis.del(pairingKey(id));
            // Reseta circuit breaker e lock de reconexão
            await redis.del(`wa:consec_401:${id}`).catch(() => { });
            await redis.del(`wa:reconnect_lock:${id}`).catch(() => { });
            const { connections } = await Promise.resolve().then(() => __importStar(require('../atendimento/atendimento.db.schema')));
            const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
            await client_1.db
                .update(connections)
                .set({
                status: 'connected',
                ...(data.serializedId ? { serialized_id: data.serializedId } : {}),
            })
                .where(eq(connections.id, id))
                .catch(() => { });
            // Notifica frontend em tempo real
            let connC;
            try {
                const [r] = await client_1.db.select({ company_id: connections.company_id }).from(connections).where(eq(connections.id, id)).limit(1);
                connC = r;
            }
            catch { }
            if (connC?.company_id) {
                (0, socket_1.emitToCompany)(String(connC.company_id), 'connection:status', {
                    connectionId: id, status: 'connected',
                });
            }
            // Tabela de saúde: conexão bem-sucedida → zera contadores de falha
            await client_1.db.insert(atendimento_db_schema_1.connection_health)
                .values({ connection_id: id, consecutive_401s: 0, last_connected_at: new Date(), status: 'healthy', updated_at: new Date() })
                .onConflictDoUpdate({
                target: atendimento_db_schema_1.connection_health.connection_id,
                set: { consecutive_401s: 0, last_connected_at: new Date(), status: 'healthy', updated_at: new Date() },
            })
                .catch(() => { });
            console.log(`[WA:${id}] WhatsApp connected, serializedId:`, data.serializedId);
        }
        else if (data.type === 'disconnected') {
            await redis.set(statusKey(id), 'disconnected', 'EX', STATUS_TTL);
            await redis.del(qrKey(id));
            await redis.del(pairingKey(id));
            const { connections } = await Promise.resolve().then(() => __importStar(require('../atendimento/atendimento.db.schema')));
            const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
            await client_1.db
                .update(connections)
                .set({ status: 'disconnected' })
                .where(eq(connections.id, id))
                .catch(() => { });
            // Busca company_id para notificações
            let connD;
            try {
                const [r] = await client_1.db.select({ company_id: connections.company_id, name: connections.name }).from(connections).where(eq(connections.id, id)).limit(1);
                connD = r;
            }
            catch { }
            // Notifica frontend imediatamente — sem depender de polling
            if (connD?.company_id) {
                (0, socket_1.emitToCompany)(String(connD.company_id), 'connection:status', {
                    connectionId: id, status: 'disconnected', code: data.code,
                });
            }
            // Alerta por e-mail — best-effort, nunca bloqueia o resto do fluxo
            if (connD?.company_id) {
                try {
                    const { companies } = await Promise.resolve().then(() => __importStar(require('../companies/company.db.schema')));
                    const { companyPermissions, companyEmailNotify } = await Promise.resolve().then(() => __importStar(require('../configuracao-geral/configuracao-geral.db.schema')));
                    const { sendDropConnectionEmail } = await Promise.resolve().then(() => __importStar(require('../../shared/email/resend.service')));
                    const [perms] = await client_1.db.select({ notify_by_email_connection: companyPermissions.notify_by_email_connection })
                        .from(companyPermissions)
                        .where(eq(companyPermissions.company_id, connD.company_id));
                    if (perms?.notify_by_email_connection) {
                        const emailRows = await client_1.db.select({ email: companyEmailNotify.email })
                            .from(companyEmailNotify)
                            .where(eq(companyEmailNotify.company_id, connD.company_id));
                        if (emailRows.length > 0) {
                            const [company] = await client_1.db.select({ name: companies.name }).from(companies).where(eq(companies.id, connD.company_id));
                            await sendDropConnectionEmail({
                                to: emailRows.map(r => r.email),
                                connectionName: connD.name,
                                companyName: company?.name ?? '',
                                code: data.code,
                                reason: data.reason,
                            });
                        }
                    }
                }
                catch (err) {
                    console.error(`[WA:${id}] Falha ao processar alerta de e-mail de queda:`, err);
                }
            }
            const codeLabels = {
                401: 'loggedOut — sessão removida pelo WhatsApp/usuário',
                403: 'forbidden — conta bloqueada ou protocolo rejeitado',
                408: 'timeout — queda de rede temporária',
                411: 'multidevice mismatch — credenciais inválidas',
                428: 'restart required — protocolo pediu reinício',
                440: 'connection replaced — outro dispositivo conectou',
                500: 'bad session — credenciais corrompidas',
                503: 'unavailable service — servidores WhatsApp instáveis',
            };
            await logConnectionError({
                connectionId: id,
                errorType: 'disconnect',
                errorCode: data.code,
                errorMessage: data.code ? (codeLabels[data.code] ?? `código ${data.code}`) : (data.reason ?? 'desconexão sem código'),
                completeError: data,
            });
            // Tabela de saúde: incrementa contador de desconexões
            await client_1.db.insert(atendimento_db_schema_1.connection_health)
                .values({ connection_id: id, disconnect_count_24h: 1, status: 'healthy', updated_at: new Date() })
                .onConflictDoUpdate({
                target: atendimento_db_schema_1.connection_health.connection_id,
                set: {
                    disconnect_count_24h: (0, drizzle_orm_1.sql) `${atendimento_db_schema_1.connection_health.disconnect_count_24h} + 1`,
                    status: (0, drizzle_orm_1.sql) `CASE WHEN ${atendimento_db_schema_1.connection_health.status} = 'healthy' AND ${atendimento_db_schema_1.connection_health.disconnect_count_24h} + 1 >= 3 THEN 'degraded' ELSE ${atendimento_db_schema_1.connection_health.status} END`,
                    updated_at: new Date(),
                },
            })
                .catch(() => { });
            if (data.code === 401 || data.code === 403) {
                // Circuit breaker: bloqueia reconexão após 3 logouts em 1h
                const failKey = `wa:consec_401:${id}`;
                const count = await redis.incr(failKey);
                await redis.expire(failKey, 3600);
                if (count >= 3) {
                    await redis.set(statusKey(id), 'needs_reauth', 'EX', STATUS_TTL);
                    if (connD?.company_id) {
                        (0, socket_1.emitToCompany)(String(connD.company_id), 'connection:needs_reauth', {
                            connectionId: id,
                            message: 'Reconexão bloqueada após múltiplos logouts. Escaneie o QR novamente.',
                        });
                    }
                    console.warn(`[WA:${id}] Circuit breaker: ${count} logouts em 1h — exige re-auth manual`);
                }
                else {
                    // Apaga sessão e credenciais — evita loop de reconexão com creds inválidas
                    baysDelete(`/session/delete/${id}`).catch(() => { });
                    try {
                        const specificKeys = await redis.keys(`baileys:auth:${id}:*`);
                        const legacyKeys = await redis.keys(`baileys:auth:*`);
                        const allCreds = [...new Set([...specificKeys, ...legacyKeys])];
                        if (allCreds.length > 0)
                            await redis.del(...allCreds);
                        console.log(`[WA:${id}] Credenciais removidas após logout ${count}/3`);
                    }
                    catch { }
                }
                // Tabela de saúde: persiste contagem de 401s além do TTL do Redis
                await client_1.db.insert(atendimento_db_schema_1.connection_health)
                    .values({ connection_id: id, consecutive_401s: 1, last_401_at: new Date(), status: 'needs_reauth', updated_at: new Date() })
                    .onConflictDoUpdate({
                    target: atendimento_db_schema_1.connection_health.connection_id,
                    set: {
                        consecutive_401s: (0, drizzle_orm_1.sql) `${atendimento_db_schema_1.connection_health.consecutive_401s} + 1`,
                        last_401_at: new Date(),
                        status: (0, drizzle_orm_1.sql) `CASE WHEN ${atendimento_db_schema_1.connection_health.consecutive_401s} + 1 >= 3 THEN 'banned_suspect' ELSE 'needs_reauth' END`,
                        updated_at: new Date(),
                    },
                })
                    .catch(() => { });
            }
            console.log(`[WA:${id}] WhatsApp disconnected, code:`, data.code, 'reason:', data.reason);
        }
    },
    async handleConnectionError(connectionId, payload) {
        const body = payload;
        await logConnectionError({
            connectionId,
            errorType: String(body?.error_type ?? 'bays_internal'),
            errorCode: body?.code ? Number(body.code) : undefined,
            errorMessage: body?.message ? String(body.message) : undefined,
            completeError: payload,
        });
    },
    async handleMessagesWebhook(connectionId, payload) {
        const raw = payload;
        const msg = (raw?.data ?? raw);
        const key = msg?.key;
        if (!key?.remoteJid)
            return;
        const jid = String(key.remoteJid);
        if (jid.endsWith('@g.us'))
            return;
        // Sistema de usernames do WhatsApp (Meta 2026): quando o contato conversa
        // via username, o remoteJid é "<lid>@lid" e o número pode NÃO vir. Antes o
        // sistema descartava essas mensagens — agora o LID é o identificador válido.
        const lid = jid.endsWith('@lid') ? jid.replace('@lid', '').replace(/\D/g, '') : undefined;
        let phone = '';
        if (jid.endsWith('@lid')) {
            // Número só existe se a Meta revelar via sender_pn; senão fica vazio (LID-only)
            const senderPn = String(key.sender_pn ?? '');
            phone = senderPn ? senderPn.replace('@s.whatsapp.net', '').replace(/\D/g, '') : '';
        }
        else {
            phone = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        }
        // Username público (@apelido). A Meta ainda não o expõe no payload Baileys;
        // lido defensivamente para já funcionar quando passar a vir.
        const waUsername = (typeof msg.contactUsername === 'string'
            ? String(msg.contactUsername)
            : '') ||
            (typeof key.senderUsername === 'string'
                ? String(key.senderUsername)
                : '') ||
            '';
        const fromMe = Boolean(key.fromMe);
        // pushName é o nome do AUTOR da mensagem: em fromMe é o nome do dono da
        // conexão, nunca do contato. Nesse caso não passa nome — o findOrCreate
        // usa o fallback (número/@username/LID) e o pushName real assume quando
        // o contato responder (refreshNameFromPushName).
        const pushName = typeof msg.pushName === 'string' ? msg.pushName.trim() : '';
        const nome = !fromMe && pushName ? pushName : undefined;
        const rawMsg = msg.message ?? {};
        const imgCaption = String(rawMsg.imageMessage?.caption ?? '');
        const vidCaption = String(rawMsg.videoMessage?.caption ?? '');
        const docTitle = String(rawMsg.documentMessage?.title ?? '');
        const docFileName = String(rawMsg.documentMessage?.fileName ?? '');
        const body = String(rawMsg.conversation ?? '') ||
            String(rawMsg.extendedTextMessage?.text ?? '') ||
            (rawMsg.imageMessage ? (imgCaption || '[Imagem]') : '') ||
            (rawMsg.videoMessage ? (vidCaption || '[Vídeo]') : '') ||
            (rawMsg.audioMessage ? '[Áudio]' : '') ||
            (rawMsg.stickerMessage ? '[Figurinha]' : '') ||
            (rawMsg.documentMessage ? (docTitle || docFileName || '[Documento]') : '') ||
            (rawMsg.contactMessage ? '[Contato]' : '') ||
            (rawMsg.locationMessage ? '[Localização]' : '') ||
            '';
        const { contactService } = await Promise.resolve().then(() => __importStar(require('../atendimento/contact.service')));
        const { ticketService } = await Promise.resolve().then(() => __importStar(require('../atendimento/ticket.service')));
        const { messageService } = await Promise.resolve().then(() => __importStar(require('../atendimento/message.service')));
        const { connections } = await Promise.resolve().then(() => __importStar(require('../atendimento/atendimento.db.schema')));
        const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        const [conn] = await client_1.db
            .select()
            .from(connections)
            .where(eq(connections.id, connectionId))
            .limit(1);
        if (!conn) {
            console.warn(`[WA webhook] Nenhuma at_connection encontrada para id:`, connectionId);
            return;
        }
        const companyId = conn.company_id;
        const profileImgUrl = String(msg.profileImgUrl ?? '');
        // Identificador de envio: número quando existe, senão o LID (contato username-only)
        const sendTarget = phone || (lid ? `lid:${lid}` : '');
        let contact = await contactService.findOrCreate(companyId, phone, nome, lid, waUsername || undefined);
        contact = await contactService.refreshNameFromPushName(contact, pushName, fromMe);
        if (profileImgUrl && profileImgUrl.startsWith('http') && contact.profile_pic_url !== profileImgUrl) {
            const { contacts: contactsTable } = await Promise.resolve().then(() => __importStar(require('../atendimento/atendimento.db.schema')));
            const { db: _db } = await Promise.resolve().then(() => __importStar(require('../../database/client')));
            const { eq: _eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
            const [updated] = await _db
                .update(contactsTable)
                .set({ profile_pic_url: profileImgUrl })
                .where(_eq(contactsTable.id, contact.id))
                .returning();
            if (updated)
                contact = updated;
        }
        if (!contact.profile_pic_url && phone) {
            try {
                const picData = await baysPost(`/contact/imgurl/${connectionId}`, { contact: phone });
                const fetchedUrl = picData?.imgUrl;
                if (fetchedUrl && typeof fetchedUrl === 'string' && fetchedUrl.startsWith('http')) {
                    const { contacts: contactsTable } = await Promise.resolve().then(() => __importStar(require('../atendimento/atendimento.db.schema')));
                    const { db: _db } = await Promise.resolve().then(() => __importStar(require('../../database/client')));
                    const { eq: _eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
                    const [updated] = await _db
                        .update(contactsTable)
                        .set({ profile_pic_url: fetchedUrl })
                        .where(_eq(contactsTable.id, contact.id))
                        .returning();
                    if (updated)
                        contact = updated;
                }
            }
            catch { }
        }
        if (fromMe) {
            // Eco do nosso próprio envio: o Baileys reporta a mensagem que A GENTE
            // manda (despedida, saudação de fila, etc.) de volta como um evento de
            // "mensagem recebida" (message-upsert com fromMe:true). Só nos interessa
            // se já existe um ticket aberto pra anexar — nunca cria um do zero, senão
            // toda mensagem automática enviada logo após fechar um ticket recria um
            // ticket fantasma em "Aguardando" pro mesmo contato.
            const existingTicket = await ticketService.findOpenTicket(companyId, contact.id, conn.id);
            if (!existingTicket)
                return;
        }
        const { ticket, created: ticketCreated } = await ticketService.findOrCreateOpen(companyId, contact.id, conn.id, jid);
        // Se ticket novo e mensagem do cliente: tenta identificar origem por palavra-chave
        if (ticketCreated && body && !fromMe) {
            Promise.resolve().then(() => __importStar(require('../crm/crm-config.service'))).then(async ({ matchKeywordOrigin }) => {
                const origin = await matchKeywordOrigin(companyId, body);
                if (origin) {
                    const { tickets: ticketsTable } = await Promise.resolve().then(() => __importStar(require('./../../modules/atendimento/atendimento.db.schema')));
                    const { eq: _eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
                    await client_1.db.update(ticketsTable).set({ origin }).where(_eq(ticketsTable.id, ticket.id));
                }
            }).catch(() => { });
        }
        (0, socket_1.emitToCompany)(companyId, 'contact:upserted', { contact });
        if (body && !fromMe) {
            // Tenta capturar resposta de pesquisa antes de salvar mensagem
            const { pesquisaService } = await Promise.resolve().then(() => __importStar(require('../pesquisas/pesquisa.service')));
            const wasAnswer = await pesquisaService.tryRecordAnswer(companyId, contact.id, body).catch(() => false);
            if (!wasAnswer) {
                const media = msg.media;
                await messageService.save(ticket.id, contact.id, body, fromMe, companyId, {
                    mediaType: media?.mimetype || undefined,
                    mediaUrl: media?.url || undefined,
                    mediaWaveform: media?.waveform,
                    mediaSeconds: media?.seconds,
                });
                const { shouldRunBot } = await Promise.resolve().then(() => __importStar(require('../atendimento/ticket.service')));
                if (sendTarget && shouldRunBot(ticket)) {
                    const { chatbotExecutorService } = await Promise.resolve().then(() => __importStar(require('../bots/chatbot-executor.service')));
                    chatbotExecutorService.execute(companyId, connectionId, sendTarget, body, ticket.id, contact.id, contact.name).catch((err) => console.error('[ChatbotExecutor] Falha silenciosa:', err.message));
                }
            }
        }
    },
    // ── Chats ───────────────────────────────────────────────────────────────
    async getChats(page = 1, limit = 100) {
        const id = Number(SESSION_ID);
        try {
            const data = await baysGet(`/contact/list/${id}?page=${page}&limit=${limit}`);
            if (Array.isArray(data))
                return data;
            if (Array.isArray(data?.items))
                return data.items;
            return data?.contacts ?? data?.data ?? [];
        }
        catch (err) {
            console.error('[WA] getChats error:', err.message);
            return [];
        }
    },
    // ── Messages ─────────────────────────────────────────────────────────────
    async getMessages(phone, page = 1, limit = 100) {
        const id = Number(SESSION_ID);
        try {
            const phoneNum = phone.replace(/\D/g, '');
            const data = await baysGet(`/message/list?page=${page}&limit=${limit}&connection_id=${id}`);
            const records = Array.isArray(data) ? data : (data?.data ?? []);
            return records
                .filter((m) => {
                if (!m.raw_message)
                    return false;
                try {
                    const raw = typeof m.raw_message === 'string'
                        ? JSON.parse(m.raw_message)
                        : m.raw_message;
                    const jid = raw?.key?.remoteJid ?? '';
                    return !phoneNum || jid.includes(phoneNum);
                }
                catch {
                    return false;
                }
            })
                .map((m) => {
                let raw = {};
                let bodyMessage = '';
                let fromMe = m.sended ?? false;
                try {
                    raw = typeof m.raw_message === 'string'
                        ? JSON.parse(m.raw_message)
                        : m.raw_message;
                    const msg = raw?.message ?? raw;
                    bodyMessage =
                        msg?.conversation ||
                            msg?.extendedTextMessage?.text ||
                            msg?.imageMessage?.caption ||
                            msg?.videoMessage?.caption ||
                            msg?.documentMessage?.title ||
                            (msg?.audioMessage ? '[Áudio]' : null) ||
                            (msg?.stickerMessage ? '[Figurinha]' : null) ||
                            '';
                    fromMe = raw?.key?.fromMe ?? m.sended ?? false;
                }
                catch { /**/ }
                return {
                    id: m.id,
                    bodyMessage,
                    mensagem: bodyMessage,
                    from_me: fromMe,
                    sended: fromMe,
                    created_at: m.created_at,
                    timestamp: m.created_at ? new Date(m.created_at).getTime() / 1000 : 0,
                };
            })
                .filter((m) => m.bodyMessage);
        }
        catch (err) {
            console.error('[WA] getMessages error:', err.message);
            return [];
        }
    },
    // ── Send ─────────────────────────────────────────────────────────────────
    async sendMessage(phone, text) {
        const id = Number(SESSION_ID);
        const phoneNum = phone.replace(/\D/g, '');
        return baysPost(`/message/send/${id}`, {
            type: 'text',
            contact: phoneNum,
            payload: { text },
        });
    },
    /** Envia texto para um contato username-only (sem número), roteando pelo LID. */
    async sendMessageViaLid(lid, text, connectionId) {
        const id = Number(connectionId ?? SESSION_ID);
        const lidNum = lid.replace(/\D/g, '');
        return baysPost(`/message/send/${id}`, {
            type: 'text',
            lid: lidNum,
            priority: 'lid',
            payload: { text },
        });
    },
    /**
     * Envia texto para um destino que pode ser um número ou um LID.
     * Se `target` vier no formato "lid:<id>", roteia pelo LID (contato username-only);
     * caso contrário trata como número normal. Não quebra chamadores que passam número puro.
     *
     * Ponto único de roteamento: conexões `whatsapp-oficial` saem pela Cloud API
     * (graph.facebook.com); as demais pelo bays (Baileys). Retorna o wamid quando
     * o envio é oficial — usado para casar os webhooks de status/ACK.
     */
    async sendTextToPhone(connectionId, target, text) {
        // Conexão oficial? (LID não existe na Cloud API — sempre número)
        if (!target.startsWith('lid:')) {
            let conn;
            try {
                const { connections } = await Promise.resolve().then(() => __importStar(require('../atendimento/atendimento.db.schema')));
                const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
                [conn] = await client_1.db.select().from(connections)
                    .where(eq(connections.id, connectionId)).limit(1);
            }
            catch {
                // Banco indisponível para o lookup → segue o fluxo bays (comportamento antigo)
            }
            if (conn?.type === 'whatsapp-oficial') {
                const { whatsappOficialService } = await Promise.resolve().then(() => __importStar(require('../whatsapp-oficial/whatsapp-oficial.service')));
                const wamid = await whatsappOficialService.sendText(conn, target, text);
                return { wabMessageId: wamid };
            }
        }
        if (target.startsWith('lid:')) {
            await this.sendMessageViaLid(target.slice(4), text, connectionId);
            return;
        }
        const phoneNum = target.replace(/\D/g, '');
        await baysPost(`/message/send/${connectionId}`, {
            type: 'text',
            contact: phoneNum,
            payload: { text },
        });
    },
    /** Campos de destino (número ou LID) no formato aceito pelo bays. */
    _sendTargetFields(target) {
        if (target.startsWith('lid:')) {
            return { lid: target.slice(4).replace(/\D/g, ''), priority: 'lid' };
        }
        return { contact: target.replace(/\D/g, '') };
    },
    /**
     * Envia mídia (imagem/vídeo/documento/áudio) por URL pública.
     * `sticker: true` envia a imagem como figurinha (bays converte p/ webp).
     */
    async sendMediaToPhone(connectionId, target, media, caption) {
        await baysPost(`/message/send/${connectionId}`, {
            type: 'media',
            ...this._sendTargetFields(target),
            payload: { text: caption || undefined, media },
        });
    },
    /** Envia um cartão de contato (vCard). */
    async sendContactCardToPhone(connectionId, target, name, phone) {
        const digits = phone.replace(/\D/g, '');
        const vcard = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `N:;${name};;;`,
            `FN:${name}`,
            `TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}`,
            'END:VCARD',
        ].join('\n');
        await baysPost(`/message/send/${connectionId}`, {
            type: 'contact',
            ...this._sendTargetFields(target),
            payload: { contacts: { displayName: name, contacts: [{ vcard, name }] } },
        });
    },
    /** Envia enquete nativa do WhatsApp (1 voto por pessoa). */
    async sendPollToPhone(connectionId, target, question, options) {
        await baysPost(`/message/send/${connectionId}`, {
            type: 'poll',
            ...this._sendTargetFields(target),
            payload: { pollMessage: { name: question, options, selectableCount: 1 } },
        });
    },
    // ── Conversas (Redis) ────────────────────────────────────────────────────
    async getConversas() {
        const redis = (0, redis_1.getRedisClient)();
        if (!redis)
            return [];
        const phones = await redis.smembers(convsSetKey());
        if (!phones.length)
            return [];
        const results = await Promise.all(phones.map(async (p) => {
            const val = await redis.get(convKey(p));
            return val ? JSON.parse(val) : null;
        }));
        return results.filter(Boolean);
    },
    async ensureConversa(phone, nome) {
        const redis = (0, redis_1.getRedisClient)();
        if (!redis)
            return;
        const phoneNum = phone.replace(/\D/g, '');
        const existing = await redis.get(convKey(phoneNum));
        if (!existing) {
            const conv = { id: phoneNum, telefone: phoneNum, nome: nome ?? phoneNum, status: 'pendente' };
            await redis.set(convKey(phoneNum), JSON.stringify(conv));
            await redis.sadd(convsSetKey(), phoneNum);
        }
    },
    async updateConversaStatus(phone, status) {
        const redis = (0, redis_1.getRedisClient)();
        if (!redis)
            return;
        const phoneNum = phone.replace(/\D/g, '');
        const existing = await redis.get(convKey(phoneNum));
        if (existing) {
            const conv = JSON.parse(existing);
            conv.status = status;
            await redis.set(convKey(phoneNum), JSON.stringify(conv));
        }
        else {
            const conv = { id: phoneNum, telefone: phoneNum, nome: phoneNum, status };
            await redis.set(convKey(phoneNum), JSON.stringify(conv));
            await redis.sadd(convsSetKey(), phoneNum);
        }
    },
};
//# sourceMappingURL=whatsapp.service.js.map