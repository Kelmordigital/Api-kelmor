import { FastifyRequest, FastifyReply } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../database/client';
import { connections, connection_errors_log } from '../atendimento/atendimento.db.schema';
import { getRedisClient } from '../../config/redis';
import { whatsappService } from './whatsapp.service';
import { env } from '../../config/env';

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

    // ── Status da sessão padrão ─────────────────────────────────────────────
    // Usa a primeira conexão cadastrada da empresa (não hardcoded session 1)

    async getStatus(req: FastifyRequest, reply: FastifyReply) {
        const id = await getCompanyConnectionId(req);
        const result = await whatsappService.getStatus(id);
        return reply.send(result);
    },

    async connect(req: FastifyRequest, reply: FastifyReply) {
        const id = await getCompanyConnectionId(req);
        await whatsappService.connect(id);
        return reply.status(202).send({ message: 'Conexão iniciada. Aguardando QR Code...' });
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

        const redis = getRedisClient();
        const result = await Promise.all(rows.map(async (c) => {
            const liveStatus = await redis?.get(`wa:status:${c.id}`) ?? c.status ?? 'disconnected';
            const qr = liveStatus === 'qr_ready' ? (await redis?.get(`wa:qr:${c.id}`) ?? null) : null;
            return { ...c, live_status: liveStatus, qr: qr ?? undefined };
        }));

        return reply.send(result);
    },

    // POST /api/v1/whatsapp/connections
    async createConnection(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(400).send({ error: 'company_id ausente no token' });

        const { name } = req.body as { name?: string };
        if (!name?.trim()) return reply.status(400).send({ error: 'name é obrigatório' });

        const [conn] = await db
            .insert(connections)
            .values({ company_id: companyId, name: name.trim(), status: 'disconnected' })
            .returning();

        // Inicia conexão no bays imediatamente
        whatsappService.connect(conn.id).catch(() => {});

        return reply.status(201).send(conn);
    },

    // DELETE /api/v1/whatsapp/connections/:id
    async removeConnection(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const connId = Number(id);

        // Desconecta do bays e limpa Redis (erros ignorados — pode já estar desconectado)
        await whatsappService.disconnect(connId).catch(() => {});

        // Remove logs de erro vinculados antes de deletar a conexão (evita FK violation)
        await db.delete(connection_errors_log).where(eq(connection_errors_log.connection_id, connId)).catch(() => {});

        await db.delete(connections).where(eq(connections.id, connId));

        return reply.send({ ok: true });
    },

    // GET /api/v1/whatsapp/connections/:id/status
    async getConnectionStatus(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const result = await whatsappService.getStatus(Number(id));
        return reply.send(result);
    },

    // POST /api/v1/whatsapp/connections/:id/connect
    async connectConnection(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        await whatsappService.connect(Number(id));
        return reply.status(202).send({ message: 'Conexão iniciada.' });
    },

    // DELETE /api/v1/whatsapp/connections/:id/disconnect
    async disconnectConnection(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        await whatsappService.disconnect(Number(id));
        return reply.send({ ok: true });
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

        return reply.send(
            rows.map((c) => ({ id: c.id, name: c.name, company_id: 1, groups: false }))
        );
    },

    async connectionUpdate(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const body = req.body as { type: string; qrCode?: string; serializedId?: string; code?: number; reason?: string };
        await whatsappService.handleConnectionUpdate(Number(id), body);
        return reply.send({ ok: true });
    },

    async messagesWebhook(req: FastifyRequest, reply: FastifyReply) {
        const { id } = (req.params as { id?: string });
        const connectionId = id ? Number(id) : 1;
        await whatsappService.handleMessagesWebhook(connectionId, req.body);
        return reply.send({ ok: true });
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
