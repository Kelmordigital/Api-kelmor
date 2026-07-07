import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import path from 'path';
import { env } from '../config/env';
import { getRedisClient } from '../config/redis';
import { errorHandler } from '../middlewares/error.middleware';
import { registerRequestLogger } from '../middlewares/logger.middleware';
import { internalAuthMiddleware, baysWebhookMiddleware } from '../middlewares/internal-auth.middleware';
import { authMiddleware, requireAdmin } from '../middlewares/auth.middleware';
import { authRoutes } from '../modules/auth/auth.routes';
import { whatsappRoutes } from '../modules/whatsapp/whatsapp.routes';
import { whatsappController } from '../modules/whatsapp/whatsapp.controller';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { atendimentoRoutes } from '../modules/atendimento/atendimento.routes';
import { quickMessagesRoutes } from '../modules/quick-messages/quick-messages.routes';
import { botsRoutes } from '../modules/bots/bots.routes';
import { etiquetasRoutes } from '../modules/etiquetas/etiqueta.routes';
import { filasRoutes } from '../modules/filas/fila.routes';
import { usuariosRoutes } from '../modules/usuarios/usuario.routes';
import { pesquisasRoutes } from '../modules/pesquisas/pesquisa.routes';
import { produtosRoutes } from '../modules/produtos/produto.routes';
import { campanhasRoutes } from '../modules/campanhas/campanha.routes';
import { integracoesRoutes } from '../modules/integracoes/integracao.routes';
import { agendaRoutes } from '../modules/agenda/agenda.routes';
import { tarefasRoutes } from '../modules/tarefas/tarefas.routes';
import { configuracaoGeralRoutes } from '../modules/configuracao-geral/configuracao-geral.routes';
import { reportsRoutes, reportTicketsRoutes } from '../modules/reports/reports.routes';
import { crmReportsRoutes } from '../modules/crm/crm-reports.routes';
import { crmConfigRoutes } from '../modules/crm/crm-config.routes';
import { superadminRoutes } from '../modules/superadmin/superadmin.routes';
import { recordHttpRequest } from '../modules/monitoring/monitoring.metrics';
import { monitoringRoutes } from '../modules/monitoring/monitoring.routes';

/**
 * Envolve um conjunto de rotas exigindo papel admin/superAdmin.
 * Aplica authMiddleware (popula req.user) e requireAdmin (403 se não-admin)
 * como hooks de instância, antes dos preHandlers das próprias rotas.
 */
function adminOnly(routes: (app: FastifyInstance) => Promise<void>) {
    return async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        app.addHook('preHandler', requireAdmin);
        await routes(app);
    };
}

export function buildApp() {
    const app = Fastify({
        // Atrás do Nginx/Docker o socket vê sempre o IP interno; trustProxy faz
        // req.ip usar o X-Forwarded-For (IP real do usuário) — essencial p/ rate limit
        trustProxy: true,
        disableRequestLogging: true,
        logger: env.NODE_ENV !== 'test'
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
        if (!body || (body as string).trim() === '') { done(null, null); return; }
        try { done(null, JSON.parse(body as string)); }
        catch (err: any) { err.statusCode = 400; done(err, undefined); }
    });

    app.register(helmet);

    // CORS ANTES do rate limit: respostas 429 precisam sair com os cabeçalhos
    // de CORS, senão o navegador reporta "Network Error" em vez da mensagem.
    app.register(cors, {
        origin: [env.FRONTEND_URL, env.SUPERADMIN_URL],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    const redis = getRedisClient();
    app.register(rateLimit, {
        global: true,
        max: 200,
        timeWindow: '1 minute',
        ...(redis ? { redis } : {}),
        // IP real do usuário mesmo atrás do proxy (fallback: IP do socket)
        keyGenerator: (request) =>
            (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || request.ip,
        errorResponseBuilder: (_request, context) => ({
            statusCode: 429,
            error: 'Too Many Requests',
            message: `Limite de requisições atingido. Aguarde ${Math.ceil(context.ttl / 1000)} segundo(s).`,
        }),
    });

    app.register(cookie, { secret: env.REFRESH_SECRET });

    app.register(multipart, {
        limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    });

    app.register(staticFiles, {
        root: path.join(process.cwd(), 'uploads'),
        prefix: '/uploads/',
        decorateReply: false,
    });

    app.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: env.NODE_ENV,
    }));

    // Instrumentação HTTP para Prometheus (usa a rota registrada, não a URL
    // crua, para não explodir a cardinalidade com IDs)
    app.addHook('onResponse', (req, reply, done) => {
        recordHttpRequest(req.method, req.routeOptions?.url ?? 'unmatched', reply.statusCode, reply.elapsedTime);
        done();
    });

    app.register(monitoringRoutes);

    // ── Abertos ao atendente (perfil user) ───────────────────────────────────
    app.register(authRoutes, { prefix: '/api/v1/auth' });
    app.register(whatsappRoutes, { prefix: '/api/v1/whatsapp' });
    app.register(atendimentoRoutes, { prefix: '/api/v1/atendimento' });
    app.register(quickMessagesRoutes, { prefix: '/api/v1/configuracao/quick-messages' });
    app.register(etiquetasRoutes, { prefix: '/api/v1' });
    app.register(filasRoutes, { prefix: '/api/v1/configuracao/filas' });
    app.register(tarefasRoutes, { prefix: '/api/v1/tarefas' });

    // ── Restritos a admin/superAdmin ─────────────────────────────────────────
    app.register(adminOnly(botsRoutes), { prefix: '/api/v1/bots' });
    app.register(adminOnly(usuariosRoutes), { prefix: '/api/v1/configuracao/usuarios' });
    app.register(adminOnly(pesquisasRoutes), { prefix: '/api/v1/configuracao/pesquisas' });
    app.register(adminOnly(campanhasRoutes), { prefix: '/api/v1/configuracao/mensagens-agendadas' });
    app.register(adminOnly(produtosRoutes), { prefix: '/api/v1/configuracao/produtos' });
    // integracoes NÃO usa adminOnly: /google/callback é público (redirect OAuth do Google).
    // O gating admin é feito por-rota dentro de integracao.routes.ts.
    app.register(integracoesRoutes, { prefix: '/api/v1/integracoes' });
    app.register(adminOnly(agendaRoutes), { prefix: '/api/v1/agenda' });
    app.register(adminOnly(configuracaoGeralRoutes), { prefix: '/api/v1/configuracao/configuracoes-gerais' });
    app.register(adminOnly(reportsRoutes),       { prefix: '/api/v1/reports' });
    app.register(adminOnly(reportTicketsRoutes), { prefix: '/api/v1/reporttickets' });
    app.register(adminOnly(crmReportsRoutes),    { prefix: '/api/v1/crm-reports' });
    app.register(crmConfigRoutes, { prefix: '/api/v1/crm' });
    app.register(superadminRoutes, { prefix: '/api/v1/superadmin' });

    // Endpoints chamados pelo serviço bays — autenticados por secretkey (BAYS_SECRET_KEY)
    const baysAuth = { preHandler: baysWebhookMiddleware };
    app.put('/connection/update/:id', baysAuth, whatsappController.connectionUpdate);
    // Bays chama tanto /connection/messages-webhook quanto /connection/messages-webhook/:id
    app.post('/connection/messages-webhook', baysAuth, whatsappController.messagesWebhook);
    app.post('/connection/messages-webhook/:id', baysAuth, whatsappController.messagesWebhook);
    // Erros de conexão reportados pelo bays — persiste no banco para diagnóstico
    app.post('/connection/errors/:id', baysAuth, async (req, reply) => {
        const { id } = req.params as { id: string };
        whatsappService.handleConnectionError(Number(id), req.body).catch(() => {});
        return reply.send({ ok: true });
    });
    app.post('/connection/stealth/:id', async (_req, reply) => reply.send({ ok: true }));
    app.get('/connection/stealth/:id', async (_req, reply) => reply.send({ config: null }));
    // ACK de entrega de mensagem reportado pelo bays (handler dedicado — fase ACK)
    app.post('/connection/message-ack/:id', baysAuth, async (_req, reply) => reply.send({ ok: true }));

    // Bays startup handshake
    app.post('/container', async (_req, reply) =>
        reply.send({ id: 1, name: 'kelmor-main', exists: true })
    );
    // Retorna todas as conexões cadastradas para o bays reconectar no boot
    app.get('/connection', whatsappController.getActiveSessions);

    // Baileys auth-session persistence (bays calls these to save/restore credentials)
    // Stored in Redis under baileys:auth:{prefix}:{key}
    app.get('/auth-sessions', async (_req, reply) => {
        const redis = getRedisClient();
        if (!redis) return reply.send({ prefixes: [] });
        const keys = await redis.keys('baileys:auth:*');
        const prefixes = [...new Set(keys.map((k: string) => k.split(':').slice(2, -1).join(':')))];
        return reply.send({ prefixes });
    });
    app.put('/auth-sessions', async (req, reply) => {
        const { prefix, key, value } = req.body as { prefix: string; key: string; value?: string };
        const redis = getRedisClient();
        if (!redis) return reply.send({ ok: true });
        if (value == null) {
            await redis.del(`baileys:auth:${prefix}:${key}`);
        } else {
            await redis.set(`baileys:auth:${prefix}:${key}`, value);
        }
        return reply.send({ ok: true });
    });
    app.get('/auth-sessions/:prefix/:key', async (req, reply) => {
        const { prefix, key } = req.params as { prefix: string; key: string };
        const redis = getRedisClient();
        if (!redis) return reply.status(404).send({ value: null });
        const value = await redis.get(`baileys:auth:${prefix}:${key}`);
        if (value == null) return reply.status(404).send({ value: null });
        return reply.send({ value });
    });
    app.delete('/auth-sessions/:prefix/:key', async (req, reply) => {
        const { prefix, key } = req.params as { prefix: string; key: string };
        const redis = getRedisClient();
        if (redis) await redis.del(`baileys:auth:${prefix}:${key}`);
        return reply.send({ ok: true });
    });
    app.delete('/auth-sessions/:prefix', async (req, reply) => {
        const { prefix } = req.params as { prefix: string };
        const redis = getRedisClient();
        if (redis) {
            const keys = await redis.keys(`baileys:auth:${prefix}:*`);
            if (keys.length > 0) await redis.del(...keys);
        }
        return reply.send({ ok: true });
    });

    // Endpoint interno — chamado pelo proxy messages-api-proxy para enviar mensagens
    app.post(
        '/api/internal/send-message',
        { preHandler: internalAuthMiddleware },
        whatsappController.sendMessageProxy
    );

    registerRequestLogger(app);
    app.setErrorHandler(errorHandler);

    return app;
}
