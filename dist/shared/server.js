"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const static_1 = __importDefault(require("@fastify/static"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const redis_1 = require("../config/redis");
const error_middleware_1 = require("../middlewares/error.middleware");
const logger_middleware_1 = require("../middlewares/logger.middleware");
const internal_auth_middleware_1 = require("../middlewares/internal-auth.middleware");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const auth_routes_1 = require("../modules/auth/auth.routes");
const whatsapp_routes_1 = require("../modules/whatsapp/whatsapp.routes");
const whatsapp_controller_1 = require("../modules/whatsapp/whatsapp.controller");
const whatsapp_service_1 = require("../modules/whatsapp/whatsapp.service");
const atendimento_routes_1 = require("../modules/atendimento/atendimento.routes");
const quick_messages_routes_1 = require("../modules/quick-messages/quick-messages.routes");
const bots_routes_1 = require("../modules/bots/bots.routes");
const etiqueta_routes_1 = require("../modules/etiquetas/etiqueta.routes");
const fila_routes_1 = require("../modules/filas/fila.routes");
const usuario_routes_1 = require("../modules/usuarios/usuario.routes");
const pesquisa_routes_1 = require("../modules/pesquisas/pesquisa.routes");
const produto_routes_1 = require("../modules/produtos/produto.routes");
const campanha_routes_1 = require("../modules/campanhas/campanha.routes");
const integracao_routes_1 = require("../modules/integracoes/integracao.routes");
const agenda_routes_1 = require("../modules/agenda/agenda.routes");
const tarefas_routes_1 = require("../modules/tarefas/tarefas.routes");
const configuracao_geral_routes_1 = require("../modules/configuracao-geral/configuracao-geral.routes");
const reports_routes_1 = require("../modules/reports/reports.routes");
const crm_reports_routes_1 = require("../modules/crm/crm-reports.routes");
const crm_config_routes_1 = require("../modules/crm/crm-config.routes");
const superadmin_routes_1 = require("../modules/superadmin/superadmin.routes");
/**
 * Envolve um conjunto de rotas exigindo papel admin/superAdmin.
 * Aplica authMiddleware (popula req.user) e requireAdmin (403 se não-admin)
 * como hooks de instância, antes dos preHandlers das próprias rotas.
 */
function adminOnly(routes) {
    return async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.addHook('preHandler', auth_middleware_1.requireAdmin);
        await routes(app);
    };
}
function buildApp() {
    const app = (0, fastify_1.default)({
        // Atrás do Nginx/Docker o socket vê sempre o IP interno; trustProxy faz
        // req.ip usar o X-Forwarded-For (IP real do usuário) — essencial p/ rate limit
        trustProxy: true,
        disableRequestLogging: true,
        logger: env_1.env.NODE_ENV !== 'test'
            ? {
                level: 'info',
                transport: {
                    target: 'pino-pretty',
                    options: {
                        translateTime: 'HH:MM:ss Z',
                        ignore: 'pid,hostname',
                        colorize: true,
                    },
                },
            }
            : false,
    });
    // Bays envia DELETE/PUT com Content-Type: application/json mas body vazio — aceitar graciosamente
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
        if (!body || body.trim() === '') {
            done(null, null);
            return;
        }
        try {
            done(null, JSON.parse(body));
        }
        catch (err) {
            err.statusCode = 400;
            done(err, undefined);
        }
    });
    app.register(helmet_1.default);
    // CORS ANTES do rate limit: respostas 429 precisam sair com os cabeçalhos
    // de CORS, senão o navegador reporta "Network Error" em vez da mensagem.
    app.register(cors_1.default, {
        origin: [env_1.env.FRONTEND_URL, env_1.env.SUPERADMIN_URL],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    const redis = (0, redis_1.getRedisClient)();
    app.register(rate_limit_1.default, {
        global: true,
        max: 200,
        timeWindow: '1 minute',
        ...(redis ? { redis } : {}),
        // IP real do usuário mesmo atrás do proxy (fallback: IP do socket)
        keyGenerator: (request) => request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip,
        errorResponseBuilder: (_request, context) => ({
            statusCode: 429,
            error: 'Too Many Requests',
            message: `Limite de requisições atingido. Aguarde ${Math.ceil(context.ttl / 1000)} segundo(s).`,
        }),
    });
    app.register(cookie_1.default, { secret: env_1.env.REFRESH_SECRET });
    app.register(multipart_1.default, {
        limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    });
    app.register(static_1.default, {
        root: path_1.default.join(process.cwd(), 'uploads'),
        prefix: '/uploads/',
        decorateReply: false,
    });
    app.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: env_1.env.NODE_ENV,
    }));
    // ── Abertos ao atendente (perfil user) ───────────────────────────────────
    app.register(auth_routes_1.authRoutes, { prefix: '/api/v1/auth' });
    app.register(whatsapp_routes_1.whatsappRoutes, { prefix: '/api/v1/whatsapp' });
    app.register(atendimento_routes_1.atendimentoRoutes, { prefix: '/api/v1/atendimento' });
    app.register(quick_messages_routes_1.quickMessagesRoutes, { prefix: '/api/v1/configuracao/quick-messages' });
    app.register(etiqueta_routes_1.etiquetasRoutes, { prefix: '/api/v1' });
    app.register(fila_routes_1.filasRoutes, { prefix: '/api/v1/configuracao/filas' });
    app.register(tarefas_routes_1.tarefasRoutes, { prefix: '/api/v1/tarefas' });
    // ── Restritos a admin/superAdmin ─────────────────────────────────────────
    app.register(adminOnly(bots_routes_1.botsRoutes), { prefix: '/api/v1/bots' });
    app.register(adminOnly(usuario_routes_1.usuariosRoutes), { prefix: '/api/v1/configuracao/usuarios' });
    app.register(adminOnly(pesquisa_routes_1.pesquisasRoutes), { prefix: '/api/v1/configuracao/pesquisas' });
    app.register(adminOnly(campanha_routes_1.campanhasRoutes), { prefix: '/api/v1/configuracao/mensagens-agendadas' });
    app.register(adminOnly(produto_routes_1.produtosRoutes), { prefix: '/api/v1/configuracao/produtos' });
    // integracoes NÃO usa adminOnly: /google/callback é público (redirect OAuth do Google).
    // O gating admin é feito por-rota dentro de integracao.routes.ts.
    app.register(integracao_routes_1.integracoesRoutes, { prefix: '/api/v1/integracoes' });
    app.register(adminOnly(agenda_routes_1.agendaRoutes), { prefix: '/api/v1/agenda' });
    app.register(adminOnly(configuracao_geral_routes_1.configuracaoGeralRoutes), { prefix: '/api/v1/configuracao/configuracoes-gerais' });
    app.register(adminOnly(reports_routes_1.reportsRoutes), { prefix: '/api/v1/reports' });
    app.register(adminOnly(reports_routes_1.reportTicketsRoutes), { prefix: '/api/v1/reporttickets' });
    app.register(adminOnly(crm_reports_routes_1.crmReportsRoutes), { prefix: '/api/v1/crm-reports' });
    app.register(crm_config_routes_1.crmConfigRoutes, { prefix: '/api/v1/crm' });
    app.register(superadmin_routes_1.superadminRoutes, { prefix: '/api/v1/superadmin' });
    // Endpoints chamados pelo serviço bays — autenticados por secretkey (BAYS_SECRET_KEY)
    const baysAuth = { preHandler: internal_auth_middleware_1.baysWebhookMiddleware };
    app.put('/connection/update/:id', baysAuth, whatsapp_controller_1.whatsappController.connectionUpdate);
    // Bays chama tanto /connection/messages-webhook quanto /connection/messages-webhook/:id
    app.post('/connection/messages-webhook', baysAuth, whatsapp_controller_1.whatsappController.messagesWebhook);
    app.post('/connection/messages-webhook/:id', baysAuth, whatsapp_controller_1.whatsappController.messagesWebhook);
    // Erros de conexão reportados pelo bays — persiste no banco para diagnóstico
    app.post('/connection/errors/:id', baysAuth, async (req, reply) => {
        const { id } = req.params;
        whatsapp_service_1.whatsappService.handleConnectionError(Number(id), req.body).catch(() => { });
        return reply.send({ ok: true });
    });
    app.post('/connection/stealth/:id', async (_req, reply) => reply.send({ ok: true }));
    app.get('/connection/stealth/:id', async (_req, reply) => reply.send({ config: null }));
    // ACK de entrega de mensagem reportado pelo bays (handler dedicado — fase ACK)
    app.post('/connection/message-ack/:id', baysAuth, async (_req, reply) => reply.send({ ok: true }));
    // Bays startup handshake
    app.post('/container', async (_req, reply) => reply.send({ id: 1, name: 'kelmor-main', exists: true }));
    // Retorna todas as conexões cadastradas para o bays reconectar no boot
    app.get('/connection', whatsapp_controller_1.whatsappController.getActiveSessions);
    // Baileys auth-session persistence (bays calls these to save/restore credentials)
    // Stored in Redis under baileys:auth:{prefix}:{key}
    app.get('/auth-sessions', async (_req, reply) => {
        const redis = (0, redis_1.getRedisClient)();
        if (!redis)
            return reply.send({ prefixes: [] });
        const keys = await redis.keys('baileys:auth:*');
        const prefixes = [...new Set(keys.map((k) => k.split(':').slice(2, -1).join(':')))];
        return reply.send({ prefixes });
    });
    app.put('/auth-sessions', async (req, reply) => {
        const { prefix, key, value } = req.body;
        const redis = (0, redis_1.getRedisClient)();
        if (!redis)
            return reply.send({ ok: true });
        if (value == null) {
            await redis.del(`baileys:auth:${prefix}:${key}`);
        }
        else {
            await redis.set(`baileys:auth:${prefix}:${key}`, value);
        }
        return reply.send({ ok: true });
    });
    app.get('/auth-sessions/:prefix/:key', async (req, reply) => {
        const { prefix, key } = req.params;
        const redis = (0, redis_1.getRedisClient)();
        if (!redis)
            return reply.status(404).send({ value: null });
        const value = await redis.get(`baileys:auth:${prefix}:${key}`);
        if (value == null)
            return reply.status(404).send({ value: null });
        return reply.send({ value });
    });
    app.delete('/auth-sessions/:prefix/:key', async (req, reply) => {
        const { prefix, key } = req.params;
        const redis = (0, redis_1.getRedisClient)();
        if (redis)
            await redis.del(`baileys:auth:${prefix}:${key}`);
        return reply.send({ ok: true });
    });
    app.delete('/auth-sessions/:prefix', async (req, reply) => {
        const { prefix } = req.params;
        const redis = (0, redis_1.getRedisClient)();
        if (redis) {
            const keys = await redis.keys(`baileys:auth:${prefix}:*`);
            if (keys.length > 0)
                await redis.del(...keys);
        }
        return reply.send({ ok: true });
    });
    // Endpoint interno — chamado pelo proxy messages-api-proxy para enviar mensagens
    app.post('/api/internal/send-message', { preHandler: internal_auth_middleware_1.internalAuthMiddleware }, whatsapp_controller_1.whatsappController.sendMessageProxy);
    (0, logger_middleware_1.registerRequestLogger)(app);
    app.setErrorHandler(error_middleware_1.errorHandler);
    return app;
}
//# sourceMappingURL=server.js.map