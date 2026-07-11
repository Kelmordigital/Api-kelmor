"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappOficialService = void 0;
exports.buildTextPayload = buildTextPayload;
exports.buildButtonsPayload = buildButtonsPayload;
exports.buildListPayload = buildListPayload;
exports.buildTemplatePayload = buildTemplatePayload;
exports.buildMediaPayload = buildMediaPayload;
const drizzle_orm_1 = require("drizzle-orm");
const env_1 = require("../../config/env");
const redis_1 = require("../../config/redis");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const graph_api_client_1 = require("./graph-api.client");
/**
 * Serviço da API Oficial do WhatsApp (Cloud API / Meta).
 *
 * Envio:      POST graph.facebook.com/<phone_number_id>/messages (Bearer wab_token)
 * Onboarding: Embedded Signup (code OAuth → waba_id + phone_number_id → register)
 * Templates:  graph.facebook.com/<waba_id>/message_templates
 */
const CONN_CACHE_TTL = 60 * 60 * 4; // 4h — cache do lookup phone_number_id → connection_id
function connCacheKey(phoneNumberId) { return `wab:conn:${phoneNumberId}`; }
function base(to, replyToWamid) {
    const p = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace(/\D/g, ''),
    };
    if (replyToWamid)
        p.context = { message_id: replyToWamid };
    return p;
}
function buildTextPayload(to, text, replyToWamid) {
    return { ...base(to, replyToWamid), type: 'text', text: { body: text, preview_url: false } };
}
/** Botões interativos — a Cloud API aceita no máximo 3 opções. */
function buildButtonsPayload(to, bodyText, buttons) {
    return {
        ...base(to),
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: bodyText },
            action: {
                buttons: buttons.slice(0, 3).map((b) => ({
                    type: 'reply',
                    reply: { id: b.id, title: b.title.slice(0, 20) },
                })),
            },
        },
    };
}
/** Lista interativa — usada quando há mais de 3 opções (limite: 10 linhas por seção). */
function buildListPayload(to, bodyText, buttonLabel, rows, sectionTitle = 'Opções') {
    return {
        ...base(to),
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: bodyText },
            action: {
                button: buttonLabel.slice(0, 20),
                sections: [{
                        title: sectionTitle.slice(0, 24),
                        rows: rows.slice(0, 10).map((r) => ({
                            id: r.id,
                            title: r.title.slice(0, 24),
                            ...(r.description ? { description: r.description.slice(0, 72) } : {}),
                        })),
                    }],
            },
        },
    };
}
function buildTemplatePayload(to, name, languageCode, components) {
    return {
        ...base(to),
        type: 'template',
        template: {
            name,
            language: { code: languageCode },
            ...(components?.length ? { components } : {}),
        },
    };
}
/** Mídia por link público — a Meta baixa o arquivo a partir da URL informada. */
function buildMediaPayload(to, mediaType, link, opts = {}) {
    const media = { link };
    if (opts.caption && mediaType !== 'audio')
        media.caption = opts.caption;
    if (opts.filename && mediaType === 'document')
        media.filename = opts.filename;
    return { ...base(to), type: mediaType, [mediaType]: media };
}
// ── Service ──────────────────────────────────────────────────────────────────
exports.whatsappOficialService = {
    // ── Lookup da conexão ────────────────────────────────────────────────────
    /** Localiza a conexão oficial pelo phone_number_id do webhook (cache Redis 4h). */
    async findConnectionByPhoneNumberId(phoneNumberId) {
        const redis = (0, redis_1.getRedisClient)();
        const cachedId = await redis?.get(connCacheKey(phoneNumberId));
        if (cachedId === 'none')
            return null;
        if (cachedId) {
            const [conn] = await client_1.db.select().from(atendimento_db_schema_1.connections)
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.id, Number(cachedId))).limit(1);
            if (conn)
                return conn;
        }
        const [conn] = await client_1.db.select().from(atendimento_db_schema_1.connections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.wab_business_phonenumber_id, phoneNumberId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.type, 'whatsapp-oficial')))
            .limit(1);
        if (redis) {
            await redis.set(connCacheKey(phoneNumberId), conn ? String(conn.id) : 'none', 'EX', CONN_CACHE_TTL)
                .catch(() => { });
        }
        return conn ?? null;
    },
    async getConnection(connectionId) {
        const [conn] = await client_1.db.select().from(atendimento_db_schema_1.connections)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.id, connectionId)).limit(1);
        return conn ?? null;
    },
    // ── Envio ────────────────────────────────────────────────────────────────
    /**
     * POST /<phone_number_id>/messages. Retorna o wamid da mensagem enviada
     * (usado depois para casar os webhooks de status/ACK).
     */
    async sendPayload(conn, payload) {
        if (!conn.wab_business_phonenumber_id || !conn.wab_token) {
            throw new Error(`Conexão ${conn.id} sem wab_business_phonenumber_id/wab_token`);
        }
        const data = await (0, graph_api_client_1.graphPost)(`/${conn.wab_business_phonenumber_id}/messages`, conn.wab_token, payload);
        return data?.messages?.[0]?.id;
    },
    async sendText(conn, to, text, replyToWamid) {
        if (!text?.trim())
            throw new Error('Mensagem vazia');
        return this.sendPayload(conn, buildTextPayload(to, text, replyToWamid));
    },
    async sendMedia(conn, to, mediaType, link, opts = {}) {
        return this.sendPayload(conn, buildMediaPayload(to, mediaType, link, opts));
    },
    async sendTemplate(conn, to, name, languageCode = 'pt_BR', components) {
        return this.sendPayload(conn, buildTemplatePayload(to, name, languageCode, components));
    },
    // ── Mídia recebida ───────────────────────────────────────────────────────
    /** Resolve a URL temporária de um media_id (o binário é baixado à parte, autenticado). */
    async getMediaUrl(conn, mediaId) {
        if (!conn.wab_token)
            return null;
        try {
            return await (0, graph_api_client_1.graphGet)(`/${mediaId}`, conn.wab_token);
        }
        catch (err) {
            console.error(`[WAB:${conn.id}] Erro ao resolver mídia ${mediaId}:`, err.message);
            return null;
        }
    },
    // ── Onboarding (Embedded Signup) ─────────────────────────────────────────
    /**
     * Troca o code OAuth do Embedded Signup por waba_id + phone_number_id.
     * Três chamadas: oauth/access_token → debug_token → /<waba_id>/phone_numbers.
     */
    async getWabaInfoWithOAuth(code) {
        const version = env_1.env.META_GRAPH_API_VERSION;
        // 1) troca o code por um access_token do usuário
        const tokenRes = await fetch(`https://graph.facebook.com/${version}/oauth/access_token` +
            `?client_id=${env_1.env.WAB_APP_ID}&client_secret=${env_1.env.WAB_APP_SECRET}&code=${encodeURIComponent(code)}`);
        if (!tokenRes.ok)
            throw new Error(`Troca do code OAuth falhou (${tokenRes.status})`);
        const { access_token } = await tokenRes.json();
        if (!access_token)
            throw new Error('Meta não retornou access_token');
        // 2) inspeciona o token para achar o WABA nos escopos granulares
        const debug = await (0, graph_api_client_1.graphGet)(`/debug_token?input_token=${access_token}`, access_token);
        const scope = debug?.data?.granular_scopes?.find((s) => s.scope === 'whatsapp_business_management');
        const wabaId = scope?.target_ids?.[0];
        if (!wabaId)
            throw new Error('WABA não encontrado nos escopos do token');
        // 3) lista os telefones do WABA
        const phones = await (0, graph_api_client_1.graphGet)(`/${wabaId}/phone_numbers`, access_token);
        const phoneNumberId = phones?.data?.[0]?.id;
        if (!phoneNumberId)
            throw new Error('Nenhum telefone encontrado no WABA');
        return { wabaId, phoneNumberId };
    },
    /** Registra o número na Cloud API (idempotente — já registrado não é erro). */
    async registerPhoneNumber(phoneNumberId, token) {
        try {
            const info = await (0, graph_api_client_1.graphGet)(`/${phoneNumberId}?fields=platform_type`, token);
            if (info?.platform_type === 'CLOUD_API')
                return true;
        }
        catch { /* segue para o register */ }
        try {
            const res = await (0, graph_api_client_1.graphPost)(`/${phoneNumberId}/register`, token, { messaging_product: 'whatsapp', pin: '123456' });
            return res?.success === true;
        }
        catch (err) {
            console.error(`[WAB] Falha ao registrar número ${phoneNumberId}:`, err.message);
            return false;
        }
    },
    async getPhoneInfo(phoneNumberId, token) {
        try {
            return await (0, graph_api_client_1.graphGet)(`/${phoneNumberId}?fields=display_phone_number,verified_name`, token);
        }
        catch {
            return null;
        }
    },
    /**
     * Cria uma conexão oficial. Dois caminhos:
     *  - Embedded Signup: informa `code` (OAuth) → descobre WABA/telefone e usa WAB_USER_TOKEN
     *  - Manual: informa `wabaId` + `phoneNumberId` (+ `token` opcional, senão WAB_USER_TOKEN)
     */
    async createConnection(params) {
        let { wabaId, phoneNumberId } = params;
        if (params.code) {
            const info = await this.getWabaInfoWithOAuth(params.code);
            wabaId = info.wabaId;
            phoneNumberId = info.phoneNumberId;
        }
        if (!wabaId || !phoneNumberId) {
            throw new Error('Informe o code (Embedded Signup) ou wabaId + phoneNumberId');
        }
        const token = params.token?.trim() || env_1.env.WAB_USER_TOKEN;
        if (!token)
            throw new Error('Sem token da Meta: configure WAB_USER_TOKEN ou envie token');
        // Já existe conexão para esse telefone? Atualiza em vez de duplicar
        const existing = await this.findConnectionByPhoneNumberId(phoneNumberId);
        const isRegistered = await this.registerPhoneNumber(phoneNumberId, token);
        const phoneInfo = await this.getPhoneInfo(phoneNumberId, token);
        const values = {
            company_id: params.companyId,
            name: params.name?.trim() || phoneInfo?.verified_name || 'WhatsApp Business',
            type: 'whatsapp-oficial',
            status: 'connected',
            wab_connection: true,
            wab_business_id: wabaId,
            wab_business_phonenumber_id: phoneNumberId,
            wab_business_number: phoneInfo?.display_phone_number ?? null,
            wab_token: token,
            wab_is_registered: isRegistered,
        };
        let conn;
        if (existing) {
            const [updated] = await client_1.db.update(atendimento_db_schema_1.connections).set(values)
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.id, existing.id)).returning();
            conn = updated;
        }
        else {
            const [created] = await client_1.db.insert(atendimento_db_schema_1.connections).values(values).returning();
            conn = created;
        }
        // Invalida o cache de lookup (pode ter ficado 'none' de webhooks anteriores)
        const redis = (0, redis_1.getRedisClient)();
        await redis?.del(connCacheKey(phoneNumberId)).catch(() => { });
        return conn;
    },
    // ── Templates ────────────────────────────────────────────────────────────
    async listTemplates(conn) {
        if (!conn.wab_business_id || !conn.wab_token)
            return [];
        const res = await (0, graph_api_client_1.graphGet)(`/${conn.wab_business_id}/message_templates?limit=100`, conn.wab_token);
        return res?.data ?? [];
    },
    async createTemplate(conn, template) {
        if (!conn.wab_business_id || !conn.wab_token) {
            throw new Error('Conexão sem wab_business_id/wab_token');
        }
        return (0, graph_api_client_1.graphPost)(`/${conn.wab_business_id}/message_templates`, conn.wab_token, template);
    },
    async deleteTemplate(conn, name) {
        if (!conn.wab_business_id || !conn.wab_token) {
            throw new Error('Conexão sem wab_business_id/wab_token');
        }
        return (0, graph_api_client_1.graphDelete)(`/${conn.wab_business_id}/message_templates?name=${encodeURIComponent(name)}`, conn.wab_token);
    },
};
//# sourceMappingURL=whatsapp-oficial.service.js.map