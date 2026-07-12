"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const redis_1 = require("../../config/redis");
const whatsapp_service_1 = require("./whatsapp.service");
const env_1 = require("../../config/env");
// Retorna o ID da primeira conexão da empresa, ou o SESSION_ID do env como fallback
async function getCompanyConnectionId(req) {
    try {
        const companyId = req.user?.company_id;
        if (companyId) {
            const [conn] = await client_1.db
                .select({ id: atendimento_db_schema_1.connections.id })
                .from(atendimento_db_schema_1.connections)
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId))
                .orderBy(atendimento_db_schema_1.connections.id)
                .limit(1);
            if (conn)
                return conn.id;
        }
    }
    catch { }
    return Number(env_1.env.BAYS_SESSION_ID);
}
exports.whatsappController = {
    // ── Status da sessão padrão ─────────────────────────────────────────────
    // Usa a primeira conexão cadastrada da empresa (não hardcoded session 1)
    async getStatus(req, reply) {
        const id = await getCompanyConnectionId(req);
        const result = await whatsapp_service_1.whatsappService.getStatus(id);
        return reply.send(result);
    },
    async connect(req, reply) {
        const id = await getCompanyConnectionId(req);
        await whatsapp_service_1.whatsappService.connect(id);
        return reply.status(202).send({ message: 'Conexão iniciada. Aguardando QR Code...' });
    },
    async disconnect(req, reply) {
        const id = await getCompanyConnectionId(req);
        await whatsapp_service_1.whatsappService.disconnect(id);
        return reply.send({ message: 'Desconectado com sucesso.' });
    },
    // ── Gerenciamento de conexões ───────────────────────────────────────────
    // GET /api/v1/whatsapp/connections
    async listConnections(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(400).send({ error: 'company_id ausente no token' });
        const rows = await client_1.db
            .select()
            .from(atendimento_db_schema_1.connections)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId));
        const connIds = rows.map((c) => c.id);
        const queueLinks = connIds.length
            ? await client_1.db
                .select({ connection_id: atendimento_db_schema_1.connectionQueues.connection_id, id: atendimento_db_schema_1.queues.id, name: atendimento_db_schema_1.queues.name, color: atendimento_db_schema_1.queues.color })
                .from(atendimento_db_schema_1.connectionQueues)
                .innerJoin(atendimento_db_schema_1.queues, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, atendimento_db_schema_1.connectionQueues.queue_id))
                .where((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.connectionQueues.connection_id, connIds))
            : [];
        const queuesByConn = new Map();
        for (const l of queueLinks) {
            const arr = queuesByConn.get(l.connection_id) ?? [];
            arr.push({ id: l.id, name: l.name, color: l.color });
            queuesByConn.set(l.connection_id, arr);
        }
        const redis = (0, redis_1.getRedisClient)();
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
    async createConnection(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(400).send({ error: 'company_id ausente no token' });
        const { name } = req.body;
        if (!name?.trim())
            return reply.status(400).send({ error: 'name é obrigatório' });
        const [conn] = await client_1.db
            .insert(atendimento_db_schema_1.connections)
            .values({ company_id: companyId, name: name.trim(), status: 'disconnected' })
            .returning();
        // Inicia conexão no bays imediatamente
        whatsapp_service_1.whatsappService.connect(conn.id).catch(() => { });
        return reply.status(201).send(conn);
    },
    // DELETE /api/v1/whatsapp/connections/:id
    async removeConnection(req, reply) {
        const { id } = req.params;
        const connId = Number(id);
        // Desconecta do bays e limpa Redis (erros ignorados — pode já estar desconectado)
        await whatsapp_service_1.whatsappService.disconnect(connId).catch(() => { });
        // Remove logs de erro vinculados antes de deletar a conexão (evita FK violation)
        await client_1.db.delete(atendimento_db_schema_1.connection_errors_log).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connection_errors_log.connection_id, connId)).catch(() => { });
        await client_1.db.delete(atendimento_db_schema_1.connections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.id, connId));
        return reply.send({ ok: true });
    },
    // PUT /api/v1/whatsapp/connections/:id/queues
    async updateConnectionQueues(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(400).send({ error: 'company_id ausente no token' });
        const { id } = req.params;
        const connId = Number(id);
        const { queueIds } = req.body;
        const [conn] = await client_1.db
            .select({ id: atendimento_db_schema_1.connections.id })
            .from(atendimento_db_schema_1.connections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.id, connId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId)))
            .limit(1);
        if (!conn)
            return reply.status(404).send({ error: 'Conexão não encontrada' });
        await client_1.db.delete(atendimento_db_schema_1.connectionQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connectionQueues.connection_id, connId));
        if (queueIds?.length) {
            await client_1.db.insert(atendimento_db_schema_1.connectionQueues).values(queueIds.map((qid) => ({ connection_id: connId, queue_id: qid })));
        }
        return reply.send({ ok: true });
    },
    // GET /api/v1/whatsapp/connections/:id/status
    async getConnectionStatus(req, reply) {
        const { id } = req.params;
        const result = await whatsapp_service_1.whatsappService.getStatus(Number(id));
        return reply.send(result);
    },
    // POST /api/v1/whatsapp/connections/:id/connect
    async connectConnection(req, reply) {
        const { id } = req.params;
        await whatsapp_service_1.whatsappService.connect(Number(id));
        return reply.status(202).send({ message: 'Conexão iniciada.' });
    },
    // DELETE /api/v1/whatsapp/connections/:id/disconnect
    async disconnectConnection(req, reply) {
        const { id } = req.params;
        await whatsapp_service_1.whatsappService.disconnect(Number(id));
        return reply.send({ ok: true });
    },
    // ── Chats & mensagens ───────────────────────────────────────────────────
    async getChats(req, reply) {
        const { page = '1', limit = '100' } = req.query;
        const chats = await whatsapp_service_1.whatsappService.getChats(Number(page), Number(limit));
        return reply.send(chats);
    },
    async getMessages(req, reply) {
        const { phone = '', page = '1', limit = '100' } = req.query;
        const msgs = await whatsapp_service_1.whatsappService.getMessages(phone, Number(page), Number(limit));
        return reply.send(msgs);
    },
    async sendMessage(req, reply) {
        const { phone, text } = req.body;
        if (!phone || !text) {
            return reply.status(400).send({ error: 'phone e text são obrigatórios' });
        }
        const result = await whatsapp_service_1.whatsappService.sendMessage(phone, text);
        return reply.send(result);
    },
    // ── Conversas ──────────────────────────────────────────────────────────
    async getConversas(_req, reply) {
        const conversas = await whatsapp_service_1.whatsappService.getConversas();
        return reply.send(conversas);
    },
    async updateConversaStatus(req, reply) {
        const { phone } = req.params;
        const { status } = req.body;
        if (!status)
            return reply.status(400).send({ error: 'status é obrigatório' });
        await whatsapp_service_1.whatsappService.updateConversaStatus(phone, status);
        return reply.send({ ok: true });
    },
    async ensureConversa(req, reply) {
        const { phone, nome } = req.body;
        if (!phone)
            return reply.status(400).send({ error: 'phone é obrigatório' });
        await whatsapp_service_1.whatsappService.ensureConversa(phone, nome ?? null);
        return reply.send({ ok: true });
    },
    // ── Webhooks do bays ────────────────────────────────────────────────────
    async getActiveSessions(_req, reply) {
        const rows = await client_1.db.select().from(atendimento_db_schema_1.connections);
        // Fallback: se a tabela estiver vazia, retorna a sessão padrão do .env
        // Garante que bays sempre inicia ao menos uma sessão no boot
        if (rows.length === 0) {
            return reply.send([{
                    id: Number(env_1.env.BAYS_SESSION_ID),
                    name: 'kelmor-main',
                    company_id: 1,
                    groups: false,
                }]);
        }
        return reply.send(rows.map((c) => ({ id: c.id, name: c.name, company_id: 1, groups: false })));
    },
    async connectionUpdate(req, reply) {
        const { id } = req.params;
        const body = req.body;
        await whatsapp_service_1.whatsappService.handleConnectionUpdate(Number(id), body);
        return reply.send({ ok: true });
    },
    async messagesWebhook(req, reply) {
        const { id } = req.params;
        const connectionId = id ? Number(id) : 1;
        await whatsapp_service_1.whatsappService.handleMessagesWebhook(connectionId, req.body);
        return reply.send({ ok: true });
    },
    // ── Endpoint interno — chamado pelo proxy messages-api-proxy ───────────
    async sendMessageProxy(req, reply) {
        const companyId = req.headers['x-company-id'];
        if (!companyId) {
            return reply.status(400).send({ error: 'x-company-id header é obrigatório' });
        }
        const { recipientNumber, text, senderNumber, mediaUrl } = req.body;
        if (!recipientNumber || !text) {
            return reply.status(400).send({ error: 'recipientNumber e text são obrigatórios' });
        }
        let connectionId;
        try {
            const [conn] = await client_1.db
                .select({ id: atendimento_db_schema_1.connections.id })
                .from(atendimento_db_schema_1.connections)
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId))
                .orderBy(atendimento_db_schema_1.connections.id)
                .limit(1);
            connectionId = conn?.id ?? Number(env_1.env.BAYS_SESSION_ID);
        }
        catch {
            connectionId = Number(env_1.env.BAYS_SESSION_ID);
        }
        try {
            await whatsapp_service_1.whatsappService.sendTextToPhone(connectionId, recipientNumber, text);
            return reply.status(200).send({
                success: true,
                baileysMessageId: `${Date.now()}-${recipientNumber}`,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Erro desconhecido';
            req.log.error({ error }, '[sendMessageProxy] Falha ao enviar mensagem');
            return reply.status(422).send({
                success: false,
                error: message,
            });
        }
    },
    // ── Health ──────────────────────────────────────────────────────────────
    async getHealth(_req, reply) {
        const redis = (0, redis_1.getRedisClient)();
        const status = await redis?.get('wa:status:1') ?? 'disconnected';
        const credKeys = redis ? await redis.keys('baileys:auth:*') : [];
        const hasCredentials = credKeys.length > 0;
        const recentErrors = await client_1.db
            .select()
            .from(atendimento_db_schema_1.connection_errors_log)
            .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.connection_errors_log.created_at))
            .limit(10);
        const codeLabels = {
            401: 'loggedOut', 403: 'forbidden', 408: 'timeout',
            411: 'multideviceMismatch', 428: 'restartRequired',
            440: 'connectionReplaced', 500: 'badSession', 503: 'unavailableService',
        };
        return reply.send({
            status,
            hasCredentials,
            credentialCount: credKeys.length,
            recentErrors: recentErrors.map(e => ({
                id: e.id,
                type: e.error_type,
                code: e.error_code,
                codeLabel: e.error_code ? (codeLabels[e.error_code] ?? `code_${e.error_code}`) : null,
                message: e.error_message,
                at: e.created_at,
            })),
        });
    },
};
//# sourceMappingURL=whatsapp.controller.js.map