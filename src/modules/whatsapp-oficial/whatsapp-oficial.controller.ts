import { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../../config/env';
import { whatsappOficialService } from './whatsapp-oficial.service';
import { whatsappOficialWebhookService } from './whatsapp-oficial-webhook.service';

/** Carrega a conexão e garante que pertence à empresa do usuário logado. */
async function getOwnedConnection(req: FastifyRequest, connectionId: number) {
    const conn = await whatsappOficialService.getConnection(connectionId);
    if (!conn || conn.company_id !== req.user.company_id) return null;
    if (conn.type !== 'whatsapp-oficial') return null;
    return conn;
}

export const whatsappOficialController = {

    // ── Webhook da Meta (público — GET verificação / POST eventos) ──────────

    /** Handshake: a Meta faz um GET ao cadastrar a URL e espera o hub.challenge de volta. */
    async verifyWebhook(req: FastifyRequest, reply: FastifyReply) {
        const q = req.query as Record<string, string>;
        const mode = q['hub.mode'];
        const token = q['hub.verify_token'];
        const challenge = q['hub.challenge'];

        if (mode === 'subscribe' && token === env.WAB_WEBHOOK_VERIFY_TOKEN) {
            return reply.status(200).type('text/plain').send(challenge);
        }
        return reply.status(403).send();
    },

    /** Eventos (messages/statuses). Responde 200 rápido — a Meta reenvia se demorar. */
    async webhook(req: FastifyRequest, reply: FastifyReply) {
        whatsappOficialWebhookService.handleWebhookBody(req.body)
            .catch((err: Error) => console.error('[WAB webhook] Erro não tratado:', err.message));
        return reply.status(200).send({ ok: true });
    },

    // ── Onboarding ───────────────────────────────────────────────────────────

    // POST /api/v1/whatsapp-oficial/connections
    // { code } (Embedded Signup) OU { wabaId, phoneNumberId, token? } (manual)
    async createConnection(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id;
        if (!companyId) return reply.status(400).send({ error: 'company_id ausente no token' });

        const { code, name, wabaId, phoneNumberId, token } = req.body as {
            code?: string; name?: string; wabaId?: string; phoneNumberId?: string; token?: string;
        };

        if (!code && !(wabaId && phoneNumberId)) {
            return reply.status(400).send({
                error: 'Informe o code do Embedded Signup ou wabaId + phoneNumberId',
            });
        }

        try {
            const conn = await whatsappOficialService.createConnection({
                companyId, name, code, wabaId, phoneNumberId, token,
            });
            // Não expõe o token da Meta na resposta
            const { wab_token: _omit, ...safe } = conn;
            return reply.status(201).send(safe);
        } catch (err: any) {
            req.log.error({ err }, '[WAB] Falha no onboarding');
            return reply.status(422).send({ error: err.message });
        }
    },

    // ── Templates ────────────────────────────────────────────────────────────

    // GET /api/v1/whatsapp-oficial/templates?connectionId=1
    async listTemplates(req: FastifyRequest, reply: FastifyReply) {
        const { connectionId } = req.query as { connectionId?: string };
        if (!connectionId) return reply.status(400).send({ error: 'connectionId é obrigatório' });

        const conn = await getOwnedConnection(req, Number(connectionId));
        if (!conn) return reply.status(404).send({ error: 'Conexão oficial não encontrada' });

        try {
            const templates = await whatsappOficialService.listTemplates(conn);
            return reply.send(templates);
        } catch (err: any) {
            return reply.status(422).send({ error: err.message });
        }
    },

    // POST /api/v1/whatsapp-oficial/templates
    // { connectionId, name, language, category, components }
    async createTemplate(req: FastifyRequest, reply: FastifyReply) {
        const { connectionId, name, language, category, components } = req.body as {
            connectionId: number; name: string; language?: string;
            category?: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY'; components?: unknown[];
        };
        if (!connectionId || !name?.trim()) {
            return reply.status(400).send({ error: 'connectionId e name são obrigatórios' });
        }

        const conn = await getOwnedConnection(req, Number(connectionId));
        if (!conn) return reply.status(404).send({ error: 'Conexão oficial não encontrada' });

        try {
            const result = await whatsappOficialService.createTemplate(conn, {
                name: name.trim(),
                language: language ?? 'pt_BR',
                category: category ?? 'UTILITY',
                components: components ?? [],
            });
            return reply.status(201).send(result);
        } catch (err: any) {
            return reply.status(422).send({ error: err.message });
        }
    },

    // DELETE /api/v1/whatsapp-oficial/templates/:name?connectionId=1
    async deleteTemplate(req: FastifyRequest, reply: FastifyReply) {
        const { name } = req.params as { name: string };
        const { connectionId } = req.query as { connectionId?: string };
        if (!connectionId) return reply.status(400).send({ error: 'connectionId é obrigatório' });

        const conn = await getOwnedConnection(req, Number(connectionId));
        if (!conn) return reply.status(404).send({ error: 'Conexão oficial não encontrada' });

        try {
            await whatsappOficialService.deleteTemplate(conn, name);
            return reply.send({ ok: true });
        } catch (err: any) {
            return reply.status(422).send({ error: err.message });
        }
    },

    // ── Envio de template (fora da janela de 24h só template aprovado passa) ─

    // POST /api/v1/whatsapp-oficial/send-template
    // { connectionId, to, template, language?, components? }
    async sendTemplate(req: FastifyRequest, reply: FastifyReply) {
        const { connectionId, to, template, language, components } = req.body as {
            connectionId: number; to: string; template: string;
            language?: string; components?: unknown[];
        };
        if (!connectionId || !to || !template) {
            return reply.status(400).send({ error: 'connectionId, to e template são obrigatórios' });
        }

        const conn = await getOwnedConnection(req, Number(connectionId));
        if (!conn) return reply.status(404).send({ error: 'Conexão oficial não encontrada' });

        try {
            const wamid = await whatsappOficialService.sendTemplate(conn, to, template, language ?? 'pt_BR', components);
            return reply.send({ ok: true, wamid });
        } catch (err: any) {
            return reply.status(422).send({ error: err.message });
        }
    },
};
