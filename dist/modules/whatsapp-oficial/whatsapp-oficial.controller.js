"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappOficialController = void 0;
const env_1 = require("../../config/env");
const whatsapp_oficial_service_1 = require("./whatsapp-oficial.service");
const whatsapp_oficial_webhook_service_1 = require("./whatsapp-oficial-webhook.service");
/** Carrega a conexão e garante que pertence à empresa do usuário logado. */
async function getOwnedConnection(req, connectionId) {
    const conn = await whatsapp_oficial_service_1.whatsappOficialService.getConnection(connectionId);
    if (!conn || conn.company_id !== req.user.company_id)
        return null;
    if (conn.type !== 'whatsapp-oficial')
        return null;
    return conn;
}
exports.whatsappOficialController = {
    // ── Webhook da Meta (público — GET verificação / POST eventos) ──────────
    /** Handshake: a Meta faz um GET ao cadastrar a URL e espera o hub.challenge de volta. */
    async verifyWebhook(req, reply) {
        const q = req.query;
        const mode = q['hub.mode'];
        const token = q['hub.verify_token'];
        const challenge = q['hub.challenge'];
        if (mode === 'subscribe' && token === env_1.env.WAB_WEBHOOK_VERIFY_TOKEN) {
            return reply.status(200).type('text/plain').send(challenge);
        }
        return reply.status(403).send();
    },
    /** Eventos (messages/statuses). Responde 200 rápido — a Meta reenvia se demorar. */
    async webhook(req, reply) {
        whatsapp_oficial_webhook_service_1.whatsappOficialWebhookService.handleWebhookBody(req.body)
            .catch((err) => console.error('[WAB webhook] Erro não tratado:', err.message));
        return reply.status(200).send({ ok: true });
    },
    // ── Onboarding ───────────────────────────────────────────────────────────
    // POST /api/v1/whatsapp-oficial/connections
    // { code } (Embedded Signup) OU { wabaId, phoneNumberId, token? } (manual)
    async createConnection(req, reply) {
        const companyId = req.user.company_id;
        if (!companyId)
            return reply.status(400).send({ error: 'company_id ausente no token' });
        const { code, name, wabaId, phoneNumberId, token } = req.body;
        if (!code && !(wabaId && phoneNumberId)) {
            return reply.status(400).send({
                error: 'Informe o code do Embedded Signup ou wabaId + phoneNumberId',
            });
        }
        try {
            const conn = await whatsapp_oficial_service_1.whatsappOficialService.createConnection({
                companyId, name, code, wabaId, phoneNumberId, token,
            });
            // Não expõe o token da Meta na resposta
            const { wab_token: _omit, ...safe } = conn;
            return reply.status(201).send(safe);
        }
        catch (err) {
            req.log.error({ err }, '[WAB] Falha no onboarding');
            return reply.status(422).send({ error: err.message });
        }
    },
    // ── Templates ────────────────────────────────────────────────────────────
    // GET /api/v1/whatsapp-oficial/templates?connectionId=1
    async listTemplates(req, reply) {
        const { connectionId } = req.query;
        if (!connectionId)
            return reply.status(400).send({ error: 'connectionId é obrigatório' });
        const conn = await getOwnedConnection(req, Number(connectionId));
        if (!conn)
            return reply.status(404).send({ error: 'Conexão oficial não encontrada' });
        try {
            const templates = await whatsapp_oficial_service_1.whatsappOficialService.listTemplates(conn);
            return reply.send(templates);
        }
        catch (err) {
            return reply.status(422).send({ error: err.message });
        }
    },
    // POST /api/v1/whatsapp-oficial/templates
    // { connectionId, name, language, category, components }
    async createTemplate(req, reply) {
        const { connectionId, name, language, category, components } = req.body;
        if (!connectionId || !name?.trim()) {
            return reply.status(400).send({ error: 'connectionId e name são obrigatórios' });
        }
        const conn = await getOwnedConnection(req, Number(connectionId));
        if (!conn)
            return reply.status(404).send({ error: 'Conexão oficial não encontrada' });
        try {
            const result = await whatsapp_oficial_service_1.whatsappOficialService.createTemplate(conn, {
                name: name.trim(),
                language: language ?? 'pt_BR',
                category: category ?? 'UTILITY',
                components: components ?? [],
            });
            return reply.status(201).send(result);
        }
        catch (err) {
            return reply.status(422).send({ error: err.message });
        }
    },
    // DELETE /api/v1/whatsapp-oficial/templates/:name?connectionId=1
    async deleteTemplate(req, reply) {
        const { name } = req.params;
        const { connectionId } = req.query;
        if (!connectionId)
            return reply.status(400).send({ error: 'connectionId é obrigatório' });
        const conn = await getOwnedConnection(req, Number(connectionId));
        if (!conn)
            return reply.status(404).send({ error: 'Conexão oficial não encontrada' });
        try {
            await whatsapp_oficial_service_1.whatsappOficialService.deleteTemplate(conn, name);
            return reply.send({ ok: true });
        }
        catch (err) {
            return reply.status(422).send({ error: err.message });
        }
    },
    // ── Envio de template (fora da janela de 24h só template aprovado passa) ─
    // POST /api/v1/whatsapp-oficial/send-template
    // { connectionId, to, template, language?, components? }
    async sendTemplate(req, reply) {
        const { connectionId, to, template, language, components } = req.body;
        if (!connectionId || !to || !template) {
            return reply.status(400).send({ error: 'connectionId, to e template são obrigatórios' });
        }
        const conn = await getOwnedConnection(req, Number(connectionId));
        if (!conn)
            return reply.status(404).send({ error: 'Conexão oficial não encontrada' });
        try {
            const wamid = await whatsapp_oficial_service_1.whatsappOficialService.sendTemplate(conn, to, template, language ?? 'pt_BR', components);
            return reply.send({ ok: true, wamid });
        }
        catch (err) {
            return reply.status(422).send({ error: err.message });
        }
    },
};
//# sourceMappingURL=whatsapp-oficial.controller.js.map