import { FastifyRequest, FastifyReply } from 'fastify';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import { connections, connection_errors_log, connectionQueues, queues } from '../atendimento/atendimento.db.schema';
import { getRedisClient } from '../../config/redis';
import { whatsappService } from './whatsapp.service';
import { wuzapiModule, WUZAPI_CONNECTION_TYPE, usesWuzapi } from './wuzapi/wuzapi.module';
import { env } from '../../config/env';

// Busca a conexão por id SÓ se pertencer à empresa do usuário autenticado.
// Todas as rotas de gerenciamento de conexão por :id precisam passar por
// aqui antes de ler/alterar qualquer coisa — sem isso, o id (bigserial
// sequencial e global) é trivialmente enumerável entre empresas.
async function getOwnedConnection(req: FastifyRequest, connectionId: number) {
    const companyId = req.user?.company_id;
    if (!companyId || !Number.isFinite(connectionId)) return null;
    const [conn] = await db
        .select({ id: connections.id, company_id: connections.company_id })
        .from(connections)
        .where(and(eq(connections.id, connectionId), eq(connections.company_id, companyId)))
        .limit(1);
    return conn ?? null;
}

// Retorna o ID da primeira conexão da empresa, ou o SESSION_ID do env como fallback
async function getCompanyConnectionId(req: FastifyRequest): Promise<number> {
    try {
        const companyId = req.user?.company_id;
        if (companyId) {
            const [conn] = await db
                .select({ id: connections.id })
                .from(connections)
                .where(eq(connections.company_id, companyId))
                .orderBy(connections.id)
                .limit(1);
            if (conn) return conn.id;
        }
    } catch { }
    return Number(env.BAYS_SESSION_ID);
}

export const whatsappController = {

    // ── Status da tela de Atendimento ────────────────────────────────────────
    // A empresa pode ter várias conexões (cada ticket já roteia pela sua
    // própria connection_id); essa checagem só decide se a tela de
    // Atendimento mostra a lista de tickets ou o bloqueio "WhatsApp
    // desconectado" — então "conectado" aqui precisa significar "pelo menos
    // uma das conexões está online", não só a primeira cadastrada (antes,
    // com 2 conexões e só a 1ª desconectada, a tela travava mesmo com a
    // 2ª conectada e tickets de verdade esperando).
    async getStatus(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user?.company_id;
        if (companyId) {
            const conns = await db.select({ id: connections.id })
                .from(connections)
                .where(eq(connections.company_id, companyId))
                .orderBy(connections.id);

            if (conns.length > 0) {
                const results = await Promise.all(conns.map(c => whatsappService.getStatus(c.id)));
                const connected = results.find(r => r.status === 'connected');
                return reply.send(connected ?? results[0]);
            }
        }

        const result = await whatsappService.getStatus(Number(env.BAYS_SESSION_ID));
        return reply.send(result);
    },

    async connect(req: FastifyRequest, reply: FastifyReply) {
        const id = await getCompanyConnectionId(req);
        await whatsappService.connect(id);
        return reply.status(202).send({ message: 'Conexão iniciada. Aguardando QR Code...' });
    },

    // ── Importar sessão (fingerprint do navegador) ──────────────────────────

    async generateWebToken(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const conn = await getOwnedConnection(req, Number(id));
        if (!conn) return reply.status(404).send({ error: 'Conexão não encontrada' });
        const result = await whatsappService.generateWebToken(conn.id);
        return reply.send(result);
    },

    async checkConnectionFingerprint(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const conn = await getOwnedConnection(req, Number(id));
        if (!conn) return reply.status(404).send({ error: 'Conexão não encontrada' });
        const result = await whatsappService.checkFingerprint(conn.id);
        return reply.send(result);
    },

    async disconnect(req: FastifyRequest, reply: FastifyReply) {
        const id = await getCompanyConnectionId(req);
        await whatsappService.disconnect(id);
        return reply.send({ message: 'Desconectado com sucesso.' });
    },

    // ── Gerenciamento de conexões ───────────────────────────────────────────

    // GET /api/v1/whatsapp/connections
    async listConnections(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(400).send({ error: 'company_id ausente no token' });

        const rows = await db
            .select()
            .from(connections)
            .where(eq(connections.company_id, companyId));

        const connIds = rows.map((c) => c.id);
        const queueLinks = connIds.length
            ? await db
                .select({ connection_id: connectionQueues.connection_id, id: queues.id, name: queues.name, color: queues.color })
                .from(connectionQueues)
                .innerJoin(queues, eq(queues.id, connectionQueues.queue_id))
                .where(inArray(connectionQueues.connection_id, connIds))
            : [];
        const queuesByConn = new Map<number, { id: number; name: string; color: string | null }[]>();
        for (const l of queueLinks) {
            const arr = queuesByConn.get(l.connection_id) ?? [];
            arr.push({ id: l.id, name: l.name, color: l.color });
            queuesByConn.set(l.connection_id, arr);
        }

        const redis = getRedisClient();
        const result = await Promise.all(rows.map(async (c) => {
            // Nunca expõe o token da Meta para o frontend
            const { wab_token: _omit, ...safe } = c;
            const connQueues = queuesByConn.get(c.id) ?? [];
            // Conexão oficial não tem sessão no bays: o status do banco é a verdade
            if (c.type === 'whatsapp-oficial') {
                return { ...safe, live_status: c.status ?? 'connected', qr: undefined, queues: connQueues };
            }
            const liveStatus = await redis?.get(`wa:status:${c.id}`) ?? c.status ?? 'disconnected';
            const qr = liveStatus === 'qr_ready' ? (await redis?.get(`wa:qr:${c.id}`) ?? null) : null;
            return { ...safe, live_status: liveStatus, qr: qr ?? undefined, queues: connQueues };
        }));

        return reply.send(result);
    },

    // POST /api/v1/whatsapp/connections
    async createConnection(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(400).send({ error: 'company_id ausente no token' });

        const { name, engine } = req.body as { name?: string; engine?: string };
        if (!name?.trim()) return reply.status(400).send({ error: 'name é obrigatório' });

        // Motor da conexão: bays (padrão, type 'whatsapp') ou WuzAPI
        if (engine !== undefined && engine !== 'bays' && engine !== WUZAPI_CONNECTION_TYPE) {
            return reply.status(400).send({ error: 'engine inválido (use "bays" ou "wuzapi")' });
        }
        const useWuzapi = engine === WUZAPI_CONNECTION_TYPE;
        if (useWuzapi && !wuzapiModule.isConfigured) {
            return reply.status(400).send({ error: 'WuzAPI não está disponível neste ambiente' });
        }

        const [conn] = await db
            .insert(connections)
            .values({
                company_id: companyId,
                name: name.trim(),
                status: 'disconnected',
                ...(useWuzapi ? { type: WUZAPI_CONNECTION_TYPE } : {}),
            })
            .returning();

        // Inicia conexão no bays imediatamente
        whatsappService.connect(conn.id).catch(() => {});

        return reply.status(201).send(conn);
    },

    // DELETE /api/v1/whatsapp/connections/:id
    async removeConnection(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const conn = await getOwnedConnection(req, Number(id));
        if (!conn) return reply.status(404).send({ error: 'Conexão não encontrada' });
        const connId = conn.id;

        // Desconecta do bays e limpa Redis (erros ignorados — pode já estar desconectado)
        await whatsappService.disconnect(connId).catch(() => {});

        // Remove logs de erro vinculados antes de deletar a conexão (evita FK violation)
        await db.delete(connection_errors_log).where(eq(connection_errors_log.connection_id, connId)).catch(() => {});

        await db.delete(connections).where(eq(connections.id, connId));

        return reply.send({ ok: true });
    },

    // PUT /api/v1/whatsapp/connections/:id/queues
    async updateConnectionQueues(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(400).send({ error: 'company_id ausente no token' });

        const { id } = req.params as { id: string };
        const connId = Number(id);
        const { queueIds } = req.body as { queueIds?: number[] };

        const [conn] = await db
            .select({ id: connections.id })
            .from(connections)
            .where(and(eq(connections.id, connId), eq(connections.company_id, companyId)))
            .limit(1);
        if (!conn) return reply.status(404).send({ error: 'Conexão não encontrada' });

        await db.delete(connectionQueues).where(eq(connectionQueues.connection_id, connId));
        if (queueIds?.length) {
            await db.insert(connectionQueues).values(
                queueIds.map((qid) => ({ connection_id: connId, queue_id: qid }))
            );
        }

        return reply.send({ ok: true });
    },

    // GET /api/v1/whatsapp/connections/:id/status
    async getConnectionStatus(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const conn = await getOwnedConnection(req, Number(id));
        if (!conn) return reply.status(404).send({ error: 'Conexão não encontrada' });
        const result = await whatsappService.getStatus(conn.id);
        return reply.send(result);
    },

    // POST /api/v1/whatsapp/connections/:id/connect
    async connectConnection(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const conn = await getOwnedConnection(req, Number(id));
        if (!conn) return reply.status(404).send({ error: 'Conexão não encontrada' });
        await whatsappService.connect(conn.id);
        return reply.status(202).send({ message: 'Conexão iniciada.' });
    },

    // DELETE /api/v1/whatsapp/connections/:id/disconnect
    async disconnectConnection(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const conn = await getOwnedConnection(req, Number(id));
        if (!conn) return reply.status(404).send({ error: 'Conexão não encontrada' });
        await whatsappService.disconnect(conn.id);
        return reply.send({ ok: true });
    },

    // POST /api/v1/whatsapp/connections/:id/pairing-code
    async requestPairingCode(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const { phoneNumber } = req.body as { phoneNumber?: string };
        if (!phoneNumber) {
            return reply.status(400).send({ error: 'phoneNumber é obrigatório' });
        }
        const conn = await getOwnedConnection(req, Number(id));
        if (!conn) return reply.status(404).send({ error: 'Conexão não encontrada' });
        await whatsappService.requestPairingCode(conn.id, phoneNumber);
        return reply.status(202).send({ message: 'Código de pareamento solicitado.' });
    },

    // ── Chats & mensagens ───────────────────────────────────────────────────

    async getChats(req: FastifyRequest, reply: FastifyReply) {
        const { page = '1', limit = '100' } = (req.query as Record<string, string>);
        const chats = await whatsappService.getChats(Number(page), Number(limit));
        return reply.send(chats);
    },

    async getMessages(req: FastifyRequest, reply: FastifyReply) {
        const { phone = '', page = '1', limit = '100' } = (req.query as Record<string, string>);
        const msgs = await whatsappService.getMessages(phone, Number(page), Number(limit));
        return reply.send(msgs);
    },

    async sendMessage(req: FastifyRequest, reply: FastifyReply) {
        const { phone, text } = req.body as { phone: string; text: string };
        if (!phone || !text) {
            return reply.status(400).send({ error: 'phone e text são obrigatórios' });
        }
        const result = await whatsappService.sendMessage(phone, text);
        return reply.send(result);
    },

    // ── Conversas ──────────────────────────────────────────────────────────

    async getConversas(_req: FastifyRequest, reply: FastifyReply) {
        const conversas = await whatsappService.getConversas();
        return reply.send(conversas);
    },

    async updateConversaStatus(req: FastifyRequest, reply: FastifyReply) {
        const { phone } = req.params as { phone: string };
        const { status } = req.body as { status: string };
        if (!status) return reply.status(400).send({ error: 'status é obrigatório' });
        await whatsappService.updateConversaStatus(phone, status);
        return reply.send({ ok: true });
    },

    async ensureConversa(req: FastifyRequest, reply: FastifyReply) {
        const { phone, nome } = req.body as { phone: string; nome?: string };
        if (!phone) return reply.status(400).send({ error: 'phone é obrigatório' });
        await whatsappService.ensureConversa(phone, nome ?? null);
        return reply.send({ ok: true });
    },

    // ── Webhooks do bays ────────────────────────────────────────────────────

    async getActiveSessions(_req: FastifyRequest, reply: FastifyReply) {
        const rows = await db.select().from(connections);

        // Fallback: se a tabela estiver vazia, retorna a sessão padrão do .env
        // Garante que bays sempre inicia ao menos uma sessão no boot
        if (rows.length === 0) {
            return reply.send([{
                id:         Number(env.BAYS_SESSION_ID),
                name:       'kelmor-main',
                company_id: 1,
                groups:     false,
            }]);
        }

        // Conexões da WuzAPI não são do bays: se ele as abrisse, as duas disputariam o número
        return reply.send(
            rows
                .filter((c) => !usesWuzapi(c.id, c.type))
                .map((c) => ({ id: c.id, name: c.name, company_id: 1, groups: false }))
        );
    },

    async connectionUpdate(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const body = req.body as { type: string; qrCode?: string; pairingCode?: string; serializedId?: string; code?: number; reason?: string };
        // Conexão migrada para a WuzAPI: aviso atrasado do bays não pode mexer no status dela
        if (await whatsappService.isWuzapiConnection(Number(id))) return reply.send({ ok: true, ignored: 'wuzapi' });
        await whatsappService.handleConnectionUpdate(Number(id), body);
        return reply.send({ ok: true });
    },

    async messagesWebhook(req: FastifyRequest, reply: FastifyReply) {
        const { id } = (req.params as { id?: string });
        const connectionId = id ? Number(id) : 1;
        if (await whatsappService.isWuzapiConnection(connectionId)) return reply.send({ ok: true, ignored: 'wuzapi' });
        await whatsappService.handleMessagesWebhook(connectionId, req.body);
        return reply.send({ ok: true });
    },

    // ── Endpoint interno — chamado pelo proxy messages-api-proxy ───────────

    async sendMessageProxy(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.headers['x-company-id'] as string;
        if (!companyId) {
            return reply.status(400).send({ error: 'x-company-id header é obrigatório' });
        }

        const { recipientNumber, text, senderNumber, mediaUrl } = req.body as {
            recipientNumber: string;
            text: string;
            senderNumber?: string;
            mediaUrl?: string;
        };

        if (!recipientNumber || !text) {
            return reply.status(400).send({ error: 'recipientNumber e text são obrigatórios' });
        }

        let connectionId: number;
        try {
            const [conn] = await db
                .select({ id: connections.id })
                .from(connections)
                .where(eq(connections.company_id, companyId))
                .orderBy(connections.id)
                .limit(1);
            connectionId = conn?.id ?? Number(env.BAYS_SESSION_ID);
        } catch {
            connectionId = Number(env.BAYS_SESSION_ID);
        }

        try {
            await whatsappService.sendTextToPhone(connectionId, recipientNumber, text);

            return reply.status(200).send({
                success: true,
                baileysMessageId: `${Date.now()}-${recipientNumber}`,
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Erro desconhecido';
            req.log.error({ error }, '[sendMessageProxy] Falha ao enviar mensagem');

            return reply.status(422).send({
                success: false,
                error: message,
            });
        }
    },

    /**
     * Endpoint interno — chamado pelo microsserviço `campaigns`, que já
     * resolveu qual conexão usar (rodízio entre as conexões da campanha).
     * Diferente de sendMessageProxy: aqui a conexão vem explícita, não é
     * escolhida pela empresa.
     */
    async sendTextByConnection(req: FastifyRequest, reply: FastifyReply) {
        const { connection_id, target, text } = req.body as {
            connection_id?: number;
            target?: string;
            text?: string;
        };

        if (!connection_id || !target || !text?.trim()) {
            return reply.status(400).send({ message: 'connection_id, target e text são obrigatórios' });
        }

        try {
            await whatsappService.sendTextToPhone(Number(connection_id), target, text);
            return reply.send({ ok: true });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Erro desconhecido';
            req.log.error({ error }, '[sendTextByConnection] Falha ao enviar mensagem');
            return reply.status(422).send({ ok: false, message });
        }
    },

    // ── Extensão de importação de sessão ────────────────────────────────────

    async downloadExtension(_req: FastifyRequest, reply: FastifyReply) {
        const response = await fetch(`${env.BAYS_URL}/session/extension-download`, {
            headers: { secretkey: env.BAYS_SECRET_KEY },
        });
        const buffer = Buffer.from(await response.arrayBuffer());
        reply.header('Content-Type', 'application/zip');
        reply.header('Content-Disposition', 'attachment; filename="kelmor-conecao-extension.zip"');
        return reply.send(buffer);
    },

    // ── Health ──────────────────────────────────────────────────────────────

    async getHealth(_req: FastifyRequest, reply: FastifyReply) {
        const redis = getRedisClient();
        const status = await redis?.get('wa:status:1') ?? 'disconnected';
        const credKeys = redis ? await redis.keys('baileys:auth:*') : [];
        const hasCredentials = credKeys.length > 0;

        const recentErrors = await db
            .select()
            .from(connection_errors_log)
            .orderBy(desc(connection_errors_log.created_at))
            .limit(10);

        const codeLabels: Record<number, string> = {
            401: 'loggedOut', 403: 'forbidden', 408: 'timeout',
            411: 'multideviceMismatch', 428: 'restartRequired',
            440: 'connectionReplaced', 500: 'badSession', 503: 'unavailableService',
        };

        return reply.send({
            status,
            hasCredentials,
            credentialCount: credKeys.length,
            recentErrors: recentErrors.map(e => ({
                id:        e.id,
                type:      e.error_type,
                code:      e.error_code,
                codeLabel: e.error_code ? (codeLabels[e.error_code] ?? `code_${e.error_code}`) : null,
                message:   e.error_message,
                at:        e.created_at,
            })),
        });
    },
};
