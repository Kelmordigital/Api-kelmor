import { sql } from 'drizzle-orm';
import { env } from '../../config/env';
import { getRedisClient } from '../../config/redis';
import { emitToCompany } from '../../shared/socket';
import { db } from '../../database/client';
import { connection_errors_log, connection_health, type Connection } from '../atendimento/atendimento.db.schema';

const SESSION_ID = env.BAYS_SESSION_ID;

const STATUS_TTL = 60 * 60 * 24; // 24 hours
const QR_TTL     = 180;           // 3 minutes

// ── Redis keys por sessão ────────────────────────────────────────────────────

function statusKey(id: number | string)  { return `wa:status:${id}`; }
function qrKey(id: number | string)      { return `wa:qr:${id}`; }
function pairingKey(id: number | string) { return `wa:pairing:${id}`; }
function convKey(phone: string)          { return `wa:conv:${phone}`; }
function convsSetKey()                   { return 'wa:conv_phones'; }

// ── Bays HTTP helpers ────────────────────────────────────────────────────────

async function baysGet(path: string): Promise<any> {
    const url = `${env.BAYS_URL}${path}`;
    const res = await fetch(url, {
        headers: { secretkey: env.BAYS_SECRET_KEY, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`bays GET ${path} → ${res.status}`);
    return res.json();
}

const BAYS_RETRY_ATTEMPTS = 2;
const BAYS_RETRY_DELAY_MS = 1000;
const BAYS_TIMEOUT_MS = 15000;

async function baysPost(path: string, body?: unknown): Promise<any> {
    const url = `${env.BAYS_URL}${path}`;

    for (let attempt = 1; attempt <= BAYS_RETRY_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), BAYS_TIMEOUT_MS);

        let res: Response;
        try {
            res = await fetch(url, {
                method: 'POST',
                headers: { secretkey: env.BAYS_SECRET_KEY, 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
        } catch (err) {
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
        } finally {
            clearTimeout(timeoutId);
        }

        if (res.ok) return res.json().catch(() => ({}));

        const detail = await res.json().catch(() => null) as { message?: string } | null;
        const reason = detail?.message ? `: ${detail.message}` : '';
        const err = new Error(`bays POST ${path} → ${res.status}${reason}`);

        // Só reincide em erro 5xx (falha transitória do lado do bays — ex.:
        // sessão do Baileys reconectando). Erro 4xx é do payload/requisição
        // em si e tentar de novo não vai mudar o resultado.
        const retryable = res.status >= 500 && attempt < BAYS_RETRY_ATTEMPTS;
        if (!retryable) throw err;

        await new Promise((resolve) => setTimeout(resolve, BAYS_RETRY_DELAY_MS));
    }
}

async function baysDelete(path: string): Promise<void> {
    const url = `${env.BAYS_URL}${path}`;
    await fetch(url, {
        method: 'DELETE',
        headers: { secretkey: env.BAYS_SECRET_KEY },
    });
}

// ── Log helper ───────────────────────────────────────────────────────────────

async function logConnectionError(opts: {
    connectionId: number;
    errorType: string;
    errorCode?: number;
    errorMessage?: string;
    completeError?: unknown;
}) {
    try {
        await db.insert(connection_errors_log).values({
            connection_id:  opts.connectionId,
            error_type:     opts.errorType,
            error_code:     opts.errorCode ?? null,
            error_message:  opts.errorMessage ?? null,
            complete_error: opts.completeError ? JSON.stringify(opts.completeError) : null,
        });
    } catch (err: any) {
        console.error('[WA] Erro ao salvar log de conexão:', err.message);
    }
}

// ── Service ──────────────────────────────────────────────────────────────────

export const whatsappService = {

    // ── Status & Connection ─────────────────────────────────────────────────

    async getStatus(connectionId?: number): Promise<{ status: string; qr?: string; pairingCode?: string }> {
        const id = connectionId ?? Number(SESSION_ID);
        const redis = getRedisClient();

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
            if (redis) await redis.expire(statusKey(id), STATUS_TTL);
            return { status: 'connected' };
        }
        if (cached === 'qr_ready') {
            let qr = await redis?.get(qrKey(id)) ?? null;
            // Migração chave legada do QR
            if (!qr && id === 1 && redis) {
                qr = await redis.get('wa:qr');
                if (qr) { await redis.set(qrKey(id), qr, 'EX', QR_TTL); await redis.del('wa:qr'); }
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
            const { connections } = await import('../atendimento/atendimento.db.schema');
            const { eq } = await import('drizzle-orm');
            const [conn] = await db
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
                    const isConnected =
                        data?.status === 'open' || data?.connected === true ||
                        data?.state === 'open'  || data?.connectionStatus === 'open' ||
                        data?.session?.status === 'open';
                    if (isConnected) {
                        // Reaquece o cache Redis a partir do banco
                        if (redis) await redis.set(statusKey(id), 'connected', 'EX', STATUS_TTL);
                        return { status: 'connected' };
                    }
                    // bays discorda → atualiza banco para refletir realidade
                    await db.update(connections).set({ status: 'disconnected' }).where(eq(connections.id, id)).catch(() => {});
                } catch {
                    // bays inacessível → confia no banco por ora
                    if (redis) await redis.set(statusKey(id), 'connected', 'EX', 300); // TTL curto: 5min
                    return { status: 'connected' };
                }
            }
        } catch {
            // Falha no banco → segue para verificação direta
        }

        // ── Camada 3: bays direto (verdade absoluta, ~20ms) ─────────────────
        try {
            const data = await baysGet(`/session/status/${id}`);
            const isConnected =
                data?.status === 'open' || data?.connected === true ||
                data?.state === 'open'  || data?.connectionStatus === 'open' ||
                data?.session?.status === 'open';
            if (isConnected) {
                if (redis) await redis.set(statusKey(id), 'connected', 'EX', STATUS_TTL);
                // Sincroniza banco também
                const { connections } = await import('../atendimento/atendimento.db.schema');
                const { eq } = await import('drizzle-orm');
                await db.update(connections).set({ status: 'connected' }).where(eq(connections.id, id)).catch(() => {});
                return { status: 'connected' };
            }
        } catch {
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
                        const { enqueueReconnect } = await import('../../jobs/reconnection.queue');
                        enqueueReconnect(id).catch((err: Error) =>
                            console.error(`[WA:${id}] Erro ao enfileirar reconexão:`, err.message)
                        );
                    }
                    await redis.set(statusKey(id), 'reconnecting', 'EX', 60);
                    return { status: 'reconnecting' };
                }
            } catch { }
        }

        return { status: 'disconnected' };
    },

    // ── Importar sessão (fingerprint do navegador) ──────────────────────────

    async generateWebToken(connectionId: number): Promise<{ success: boolean; token: string }> {
        return baysPost(`/session/web-token/${connectionId}`);
    },

    async checkFingerprint(connectionId: number): Promise<{ success: boolean; hasFingerprint: boolean; hasWsHeaders: boolean }> {
        return baysGet(`/session/check-fingerprint/${connectionId}`);
    },

    async connect(connectionId?: number): Promise<void> {
        const id = connectionId ?? Number(SESSION_ID);
        const redis = getRedisClient();

        // Conexão oficial não tem sessão no bays — nada a conectar via QR
        try {
            const { connections } = await import('../atendimento/atendimento.db.schema');
            const { eq } = await import('drizzle-orm');
            const [conn] = await db.select({ type: connections.type }).from(connections)
                .where(eq(connections.id, id)).limit(1);
            if (conn?.type === 'whatsapp-oficial') return;
        } catch { }

        const payload = { groups: false, company_id: 1, connection_name: `session-${id}` };

        try {
            await baysPost(`/session/create/${id}`, payload);
            if (redis) await redis.set(statusKey(id), 'loading_qr', 'EX', STATUS_TTL);
        } catch (err: any) {
            if (err.message?.includes('→ 400')) {
                // Sessão já existe no bays
                try {
                    const data = await baysGet(`/session/status/${id}`);
                    const isConnected =
                        data?.status === 'open' ||
                        data?.connected === true ||
                        data?.state === 'open' ||
                        data?.connectionStatus === 'open' ||
                        data?.session?.status === 'open';
                    if (isConnected) {
                        if (redis) await redis.set(statusKey(id), 'connected', 'EX', STATUS_TTL);
                        return;
                    }
                } catch { }
                if (redis) await redis.set(statusKey(id), 'loading_qr', 'EX', STATUS_TTL);
                await baysDelete(`/session/delete/${id}`).catch(() => {});
                baysPost(`/session/create/${id}`, payload)
                    .catch((e: Error) => console.error(`[WA:${id}] bays reconnect error:`, e.message));
            } else {
                console.error(`[WA:${id}] bays connect error:`, err.message);
            }
        }
    },

    async requestPairingCode(connectionId: number, phoneNumber: string): Promise<void> {
        const id = connectionId;
        const redis = getRedisClient();

        const payload = { phoneNumber, groups: false, company_id: 1, connection_name: `session-${id}` };

        await baysDelete(`/session/delete/${id}`).catch(() => {});
        await baysPost(`/session/pairing-code/${id}`, payload);
        if (redis) await redis.set(statusKey(id), 'loading_pairing', 'EX', STATUS_TTL);
    },

    async disconnect(connectionId?: number): Promise<void> {
        const id = connectionId ?? Number(SESSION_ID);
        const redis = getRedisClient();
        if (redis) {
            await redis.del(statusKey(id));
            await redis.del(qrKey(id));
        }
        await baysDelete(`/session/delete/${id}`).catch(() => {});
    },

    // ── Webhook from bays ───────────────────────────────────────────────────

    async handleConnectionUpdate(connectionId: number, data: {
        type: string;
        qrCode?: string;
        pairingCode?: string;
        serializedId?: string;
        code?: number;
        reason?: string;
    }): Promise<void> {
        const id = connectionId;
        const redis = getRedisClient();
        if (!redis) return;

        if (data.type === 'qrcode' && data.qrCode) {
            await redis.set(qrKey(id), data.qrCode, 'EX', QR_TTL);
            await redis.set(statusKey(id), 'qr_ready', 'EX', STATUS_TTL);
            console.log(`[WA:${id}] QR code received from bays`);

        } else if (data.type === 'pairing-code' && data.pairingCode) {
            await redis.set(pairingKey(id), data.pairingCode, 'EX', QR_TTL);
            await redis.set(statusKey(id), 'pairing_ready', 'EX', STATUS_TTL);
            console.log(`[WA:${id}] Pairing code received from bays`);

        } else if (data.type === 'connected') {
            await redis.set(statusKey(id), 'connected', 'EX', STATUS_TTL);
            await redis.del(qrKey(id));
            await redis.del(pairingKey(id));
            // Reseta circuit breaker e lock de reconexão
            await redis.del(`wa:consec_401:${id}`).catch(() => {});
            await redis.del(`wa:reconnect_lock:${id}`).catch(() => {});

            const { connections } = await import('../atendimento/atendimento.db.schema');
            const { eq } = await import('drizzle-orm');
            await db
                .update(connections)
                .set({
                    status: 'connected',
                    ...(data.serializedId ? { serialized_id: data.serializedId } : {}),
                })
                .where(eq(connections.id, id))
                .catch(() => {});

            // Notifica frontend em tempo real
            let connC: { company_id: string | null } | undefined;
            try {
                const [r] = await db.select({ company_id: connections.company_id }).from(connections).where(eq(connections.id, id)).limit(1);
                connC = r;
            } catch {}
            if (connC?.company_id) {
                emitToCompany(String(connC.company_id), 'connection:status', {
                    connectionId: id, status: 'connected',
                });
            }

            // Tabela de saúde: conexão bem-sucedida → zera contadores de falha
            await db.insert(connection_health)
                .values({ connection_id: id, consecutive_401s: 0, last_connected_at: new Date(), status: 'healthy', updated_at: new Date() })
                .onConflictDoUpdate({
                    target: connection_health.connection_id,
                    set: { consecutive_401s: 0, last_connected_at: new Date(), status: 'healthy', updated_at: new Date() },
                })
                .catch(() => {});

            console.log(`[WA:${id}] WhatsApp connected, serializedId:`, data.serializedId);

        } else if (data.type === 'disconnected') {
            await redis.set(statusKey(id), 'disconnected', 'EX', STATUS_TTL);
            await redis.del(qrKey(id));
            await redis.del(pairingKey(id));

            const { connections } = await import('../atendimento/atendimento.db.schema');
            const { eq } = await import('drizzle-orm');

            await db
                .update(connections)
                .set({ status: 'disconnected' })
                .where(eq(connections.id, id))
                .catch(() => {});

            // Busca company_id para notificações
            let connD: { company_id: string | null; name: string } | undefined;
            try {
                const [r] = await db.select({ company_id: connections.company_id, name: connections.name }).from(connections).where(eq(connections.id, id)).limit(1);
                connD = r;
            } catch {}

            // Notifica frontend imediatamente — sem depender de polling
            if (connD?.company_id) {
                emitToCompany(String(connD.company_id), 'connection:status', {
                    connectionId: id, status: 'disconnected', code: data.code,
                });
            }

            // Alerta por e-mail — best-effort, nunca bloqueia o resto do fluxo
            if (connD?.company_id) {
                try {
                    const { companies } = await import('../companies/company.db.schema');
                    const { companyPermissions, companyEmailNotify } = await import('../configuracao-geral/configuracao-geral.db.schema');
                    const { sendDropConnectionEmail } = await import('../../shared/email/resend.service');

                    const [perms] = await db.select({ notify_by_email_connection: companyPermissions.notify_by_email_connection })
                        .from(companyPermissions)
                        .where(eq(companyPermissions.company_id, connD.company_id));

                    if (perms?.notify_by_email_connection) {
                        const emailRows = await db.select({ email: companyEmailNotify.email })
                            .from(companyEmailNotify)
                            .where(eq(companyEmailNotify.company_id, connD.company_id));

                        if (emailRows.length > 0) {
                            const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, connD.company_id));
                            await sendDropConnectionEmail({
                                to: emailRows.map(r => r.email),
                                connectionName: connD.name,
                                companyName: company?.name ?? '',
                                code: data.code,
                                reason: data.reason,
                            });
                        }
                    }
                } catch (err) {
                    console.error(`[WA:${id}] Falha ao processar alerta de e-mail de queda:`, err);
                }
            }

            const codeLabels: Record<number, string> = {
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
                errorType:    'disconnect',
                errorCode:    data.code,
                errorMessage: data.code ? (codeLabels[data.code] ?? `código ${data.code}`) : (data.reason ?? 'desconexão sem código'),
                completeError: data,
            });

            // Tabela de saúde: incrementa contador de desconexões
            await db.insert(connection_health)
                .values({ connection_id: id, disconnect_count_24h: 1, status: 'healthy', updated_at: new Date() })
                .onConflictDoUpdate({
                    target: connection_health.connection_id,
                    set: {
                        disconnect_count_24h: sql`${connection_health.disconnect_count_24h} + 1`,
                        status: sql`CASE WHEN ${connection_health.status} = 'healthy' AND ${connection_health.disconnect_count_24h} + 1 >= 3 THEN 'degraded' ELSE ${connection_health.status} END`,
                        updated_at: new Date(),
                    },
                })
                .catch(() => {});

            if (data.code === 401 || data.code === 403) {
                // Circuit breaker: bloqueia reconexão após 3 logouts em 1h
                const failKey = `wa:consec_401:${id}`;
                const count = await redis.incr(failKey);
                await redis.expire(failKey, 3600);

                if (count >= 3) {
                    await redis.set(statusKey(id), 'needs_reauth', 'EX', STATUS_TTL);
                    if (connD?.company_id) {
                        emitToCompany(String(connD.company_id), 'connection:needs_reauth', {
                            connectionId: id,
                            message: 'Reconexão bloqueada após múltiplos logouts. Escaneie o QR novamente.',
                        });
                    }
                    console.warn(`[WA:${id}] Circuit breaker: ${count} logouts em 1h — exige re-auth manual`);
                } else {
                    // Apaga sessão e credenciais — evita loop de reconexão com creds inválidas
                    baysDelete(`/session/delete/${id}`).catch(() => {});
                    try {
                        const specificKeys = await redis.keys(`baileys:auth:${id}:*`);
                        const legacyKeys  = await redis.keys(`baileys:auth:*`);
                        const allCreds = [...new Set([...specificKeys, ...legacyKeys])];
                        if (allCreds.length > 0) await redis.del(...allCreds);
                        console.log(`[WA:${id}] Credenciais removidas após logout ${count}/3`);
                    } catch { }
                }

                // Tabela de saúde: persiste contagem de 401s além do TTL do Redis
                await db.insert(connection_health)
                    .values({ connection_id: id, consecutive_401s: 1, last_401_at: new Date(), status: 'needs_reauth', updated_at: new Date() })
                    .onConflictDoUpdate({
                        target: connection_health.connection_id,
                        set: {
                            consecutive_401s: sql`${connection_health.consecutive_401s} + 1`,
                            last_401_at: new Date(),
                            status: sql`CASE WHEN ${connection_health.consecutive_401s} + 1 >= 3 THEN 'banned_suspect' ELSE 'needs_reauth' END`,
                            updated_at: new Date(),
                        },
                    })
                    .catch(() => {});
            }
            console.log(`[WA:${id}] WhatsApp disconnected, code:`, data.code, 'reason:', data.reason);
        }
    },

    async handleConnectionError(connectionId: number, payload: unknown): Promise<void> {
        const body = payload as Record<string, unknown>;
        await logConnectionError({
            connectionId,
            errorType:    String(body?.error_type  ?? 'bays_internal'),
            errorCode:    body?.code ? Number(body.code) : undefined,
            errorMessage: body?.message ? String(body.message) : undefined,
            completeError: payload,
        });
    },

    async handleMessagesWebhook(connectionId: number, payload: unknown): Promise<void> {
        const raw = payload as Record<string, unknown>;
        const msg = (raw?.data ?? raw) as Record<string, unknown>;
        const key = msg?.key as Record<string, unknown> | undefined;
        if (!key?.remoteJid) return;

        const jid = String(key.remoteJid);
        if (jid.endsWith('@g.us')) return;

        // Sistema de usernames do WhatsApp (Meta 2026): quando o contato conversa
        // via username, o remoteJid é "<lid>@lid" e o número pode NÃO vir. Antes o
        // sistema descartava essas mensagens — agora o LID é o identificador válido.
        const lid = jid.endsWith('@lid') ? jid.replace('@lid', '').replace(/\D/g, '') : undefined;

        let phone = '';
        if (jid.endsWith('@lid')) {
            // Número só existe se a Meta revelar via sender_pn; senão fica vazio (LID-only)
            const senderPn = String(key.sender_pn ?? '');
            phone = senderPn ? senderPn.replace('@s.whatsapp.net', '').replace(/\D/g, '') : '';
        } else {
            phone = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        }

        // Username público (@apelido). A Meta ainda não o expõe no payload Baileys;
        // lido defensivamente para já funcionar quando passar a vir.
        const waUsername =
            (typeof (msg as Record<string, unknown>).contactUsername === 'string'
                ? String((msg as Record<string, unknown>).contactUsername)
                : '') ||
            (typeof (key as Record<string, unknown>).senderUsername === 'string'
                ? String((key as Record<string, unknown>).senderUsername)
                : '') ||
            '';

        const fromMe = Boolean(key.fromMe);
        // pushName é o nome do AUTOR da mensagem: em fromMe é o nome do dono da
        // conexão, nunca do contato. Nesse caso não passa nome — o findOrCreate
        // usa o fallback (número/@username/LID) e o pushName real assume quando
        // o contato responder (refreshNameFromPushName).
        const pushName = typeof msg.pushName === 'string' ? msg.pushName.trim() : '';
        const nome = !fromMe && pushName ? pushName : undefined;

        const rawMsg = (msg.message as Record<string, unknown> | undefined) ?? {};
        const imgCaption  = String((rawMsg.imageMessage    as Record<string, unknown> | undefined)?.caption ?? '');
        const vidCaption  = String((rawMsg.videoMessage    as Record<string, unknown> | undefined)?.caption ?? '');
        const docTitle    = String((rawMsg.documentMessage as Record<string, unknown> | undefined)?.title ?? '');
        const docFileName = String((rawMsg.documentMessage as Record<string, unknown> | undefined)?.fileName ?? '');

        const body: string =
            String(rawMsg.conversation ?? '') ||
            String((rawMsg.extendedTextMessage as Record<string, unknown> | undefined)?.text ?? '') ||
            (rawMsg.imageMessage    ? (imgCaption  || '[Imagem]')    : '') ||
            (rawMsg.videoMessage    ? (vidCaption  || '[Vídeo]')     : '') ||
            (rawMsg.audioMessage    ? '[Áudio]'                      : '') ||
            (rawMsg.stickerMessage  ? '[Figurinha]'                  : '') ||
            (rawMsg.documentMessage ? (docTitle || docFileName || '[Documento]') : '') ||
            (rawMsg.contactMessage  ? '[Contato]'                    : '') ||
            (rawMsg.locationMessage ? '[Localização]'                : '') ||
            '';

        const { contactService } = await import('../atendimento/contact.service');
        const { ticketService } = await import('../atendimento/ticket.service');
        const { messageService } = await import('../atendimento/message.service');
        const { connections } = await import('../atendimento/atendimento.db.schema');
        const { eq } = await import('drizzle-orm');

        const [conn] = await db
            .select()
            .from(connections)
            .where(eq(connections.id, connectionId))
            .limit(1);

        if (!conn) {
            console.warn(`[WA webhook] Nenhuma at_connection encontrada para id:`, connectionId);
            return;
        }

        const companyId = conn.company_id;
        const profileImgUrl = String((msg as Record<string, unknown>).profileImgUrl ?? '');

        // Identificador de envio: número quando existe, senão o LID (contato username-only)
        const sendTarget = phone || (lid ? `lid:${lid}` : '');

        let contact = await contactService.findOrCreate(companyId, phone, nome, lid, waUsername || undefined);
        contact = await contactService.refreshNameFromPushName(contact, pushName, fromMe);

        if (profileImgUrl && profileImgUrl.startsWith('http') && contact.profile_pic_url !== profileImgUrl) {
            const { contacts: contactsTable } = await import('../atendimento/atendimento.db.schema');
            const { db: _db } = await import('../../database/client');
            const { eq: _eq } = await import('drizzle-orm');
            const [updated] = await _db
                .update(contactsTable)
                .set({ profile_pic_url: profileImgUrl })
                .where(_eq(contactsTable.id, contact.id))
                .returning();
            if (updated) contact = updated;
        }

        if (!contact.profile_pic_url && phone) {
            try {
                const picData = await baysPost(`/contact/imgurl/${connectionId}`, { contact: phone });
                const fetchedUrl = picData?.imgUrl;
                if (fetchedUrl && typeof fetchedUrl === 'string' && fetchedUrl.startsWith('http')) {
                    const { contacts: contactsTable } = await import('../atendimento/atendimento.db.schema');
                    const { db: _db } = await import('../../database/client');
                    const { eq: _eq } = await import('drizzle-orm');
                    const [updated] = await _db
                        .update(contactsTable)
                        .set({ profile_pic_url: fetchedUrl })
                        .where(_eq(contactsTable.id, contact.id))
                        .returning();
                    if (updated) contact = updated;
                }
            } catch { }
        }

        if (fromMe) {
            // Eco do nosso próprio envio: o Baileys reporta a mensagem que A GENTE
            // manda (despedida, saudação de fila, etc.) de volta como um evento de
            // "mensagem recebida" (message-upsert com fromMe:true). Só nos interessa
            // se já existe um ticket aberto pra anexar — nunca cria um do zero, senão
            // toda mensagem automática enviada logo após fechar um ticket recria um
            // ticket fantasma em "Aguardando" pro mesmo contato.
            const existingTicket = await ticketService.findOpenTicket(companyId, contact.id, conn.id);
            if (!existingTicket) return;
        }

        const { ticket, created: ticketCreated } = await ticketService.findOrCreateOpen(
            companyId,
            contact.id,
            conn.id,
            jid,
        );

        // Se ticket novo e mensagem do cliente: tenta identificar origem por palavra-chave
        if (ticketCreated && body && !fromMe) {
            import('../crm/crm-config.service').then(async ({ matchKeywordOrigin }) => {
                const origin = await matchKeywordOrigin(companyId, body);
                if (origin) {
                    const { tickets: ticketsTable } = await import('./../../modules/atendimento/atendimento.db.schema');
                    const { eq: _eq } = await import('drizzle-orm');
                    await db.update(ticketsTable).set({ origin }).where(_eq(ticketsTable.id, ticket.id));
                }
            }).catch(() => {});
        }

        emitToCompany(companyId, 'contact:upserted', { contact });

        if (body && !fromMe) {
            // Tenta capturar resposta de pesquisa antes de salvar mensagem
            const { pesquisaService } = await import('../pesquisas/pesquisa.service');
            const wasAnswer = await pesquisaService.tryRecordAnswer(companyId, contact.id, body).catch(() => false);

            if (!wasAnswer) {
                const media = (msg as Record<string, unknown>).media as
                    | { url?: string; mimetype?: string; waveform?: number[]; seconds?: number }
                    | undefined;
                await messageService.save(ticket.id, contact.id, body, fromMe, companyId, {
                    mediaType: media?.mimetype || undefined,
                    mediaUrl: media?.url || undefined,
                    mediaWaveform: media?.waveform,
                    mediaSeconds: media?.seconds,
                });
                const { shouldRunBot } = await import('../atendimento/ticket.service');
                if (sendTarget && shouldRunBot(ticket)) {
                    const { chatbotExecutorService } = await import('../bots/chatbot-executor.service');
                    chatbotExecutorService.execute(companyId, connectionId, sendTarget, body, ticket.id, contact.id, contact.name).catch((err: Error) =>
                        console.error('[ChatbotExecutor] Falha silenciosa:', err.message)
                    );
                }
            }
        }
    },

    // ── Chats ───────────────────────────────────────────────────────────────

    async getChats(page = 1, limit = 100): Promise<any[]> {
        const id = Number(SESSION_ID);
        try {
            const data = await baysGet(`/contact/list/${id}?page=${page}&limit=${limit}`);
            if (Array.isArray(data)) return data;
            if (Array.isArray(data?.items)) return data.items;
            return data?.contacts ?? data?.data ?? [];
        } catch (err: any) {
            console.error('[WA] getChats error:', err.message);
            return [];
        }
    },

    // ── Messages ─────────────────────────────────────────────────────────────

    async getMessages(phone: string, page = 1, limit = 100): Promise<any[]> {
        const id = Number(SESSION_ID);
        try {
            const phoneNum = phone.replace(/\D/g, '');
            const data = await baysGet(
                `/message/list?page=${page}&limit=${limit}&connection_id=${id}`
            );
            const records: any[] = Array.isArray(data) ? data : (data?.data ?? []);

            return records
                .filter((m: any) => {
                    if (!m.raw_message) return false;
                    try {
                        const raw = typeof m.raw_message === 'string'
                            ? JSON.parse(m.raw_message)
                            : m.raw_message;
                        const jid: string = raw?.key?.remoteJid ?? '';
                        return !phoneNum || jid.includes(phoneNum);
                    } catch {
                        return false;
                    }
                })
                .map((m: any) => {
                    let raw: any = {};
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
                    } catch { /**/ }
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
                .filter((m: any) => m.bodyMessage);
        } catch (err: any) {
            console.error('[WA] getMessages error:', err.message);
            return [];
        }
    },

    // ── Send ─────────────────────────────────────────────────────────────────

    async sendMessage(phone: string, text: string): Promise<any> {
        const id = Number(SESSION_ID);
        const phoneNum = phone.replace(/\D/g, '');
        return baysPost(`/message/send/${id}`, {
            type: 'text',
            contact: phoneNum,
            payload: { text },
        });
    },

    /** Envia texto para um contato username-only (sem número), roteando pelo LID. */
    async sendMessageViaLid(lid: string, text: string, connectionId?: number): Promise<any> {
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
    async sendTextToPhone(connectionId: number, target: string, text: string): Promise<{ wabMessageId?: string } | void> {
        // Conexão oficial? (LID não existe na Cloud API — sempre número)
        if (!target.startsWith('lid:')) {
            let conn: Connection | undefined;
            try {
                const { connections } = await import('../atendimento/atendimento.db.schema');
                const { eq } = await import('drizzle-orm');
                [conn] = await db.select().from(connections)
                    .where(eq(connections.id, connectionId)).limit(1);
            } catch {
                // Banco indisponível para o lookup → segue o fluxo bays (comportamento antigo)
            }
            if (conn?.type === 'whatsapp-oficial') {
                const { whatsappOficialService } = await import('../whatsapp-oficial/whatsapp-oficial.service');
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
    _sendTargetFields(target: string): { contact?: string; lid?: string; priority?: string } {
        if (target.startsWith('lid:')) {
            return { lid: target.slice(4).replace(/\D/g, ''), priority: 'lid' };
        }
        return { contact: target.replace(/\D/g, '') };
    },

    /**
     * Envia mídia (imagem/vídeo/documento/áudio) por URL pública.
     * `sticker: true` envia a imagem como figurinha (bays converte p/ webp).
     */
    async sendMediaToPhone(
        connectionId: number,
        target: string,
        media: { path: string; mimetype: string; originalname: string; sticker?: boolean },
        caption?: string,
    ): Promise<void> {
        await baysPost(`/message/send/${connectionId}`, {
            type: 'media',
            ...this._sendTargetFields(target),
            payload: { text: caption || undefined, media },
        });
    },

    /** Envia um cartão de contato (vCard). */
    async sendContactCardToPhone(
        connectionId: number,
        target: string,
        name: string,
        phone: string,
    ): Promise<void> {
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
    async sendPollToPhone(
        connectionId: number,
        target: string,
        question: string,
        options: string[],
    ): Promise<void> {
        await baysPost(`/message/send/${connectionId}`, {
            type: 'poll',
            ...this._sendTargetFields(target),
            payload: { pollMessage: { name: question, options, selectableCount: 1 } },
        });
    },

    // ── Conversas (Redis) ────────────────────────────────────────────────────

    async getConversas(): Promise<any[]> {
        const redis = getRedisClient();
        if (!redis) return [];
        const phones = await redis.smembers(convsSetKey());
        if (!phones.length) return [];
        const results = await Promise.all(
            phones.map(async (p) => {
                const val = await redis.get(convKey(p));
                return val ? JSON.parse(val) : null;
            })
        );
        return results.filter(Boolean);
    },

    async ensureConversa(phone: string, nome: string | null): Promise<void> {
        const redis = getRedisClient();
        if (!redis) return;
        const phoneNum = phone.replace(/\D/g, '');
        const existing = await redis.get(convKey(phoneNum));
        if (!existing) {
            const conv = { id: phoneNum, telefone: phoneNum, nome: nome ?? phoneNum, status: 'pendente' };
            await redis.set(convKey(phoneNum), JSON.stringify(conv));
            await redis.sadd(convsSetKey(), phoneNum);
        }
    },

    async updateConversaStatus(phone: string, status: string): Promise<void> {
        const redis = getRedisClient();
        if (!redis) return;
        const phoneNum = phone.replace(/\D/g, '');
        const existing = await redis.get(convKey(phoneNum));
        if (existing) {
            const conv = JSON.parse(existing);
            conv.status = status;
            await redis.set(convKey(phoneNum), JSON.stringify(conv));
        } else {
            const conv = { id: phoneNum, telefone: phoneNum, nome: phoneNum, status };
            await redis.set(convKey(phoneNum), JSON.stringify(conv));
            await redis.sadd(convsSetKey(), phoneNum);
        }
    },
};
