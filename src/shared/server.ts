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
import { authRouter } from '../modules/auth/auth.module';
import { whatsappRoutes } from '../modules/whatsapp/whatsapp.routes';
import { whatsappController } from '../modules/whatsapp/whatsapp.controller';
import { whatsappService } from '../modules/whatsapp/whatsapp.service';
import { wuzapiWebhook } from '../modules/whatsapp/wuzapi/wuzapi-webhook.controller';
import { whatsappOficialRouter, cloudWebhookRouter } from '../modules/whatsapp-oficial/whatsapp-oficial.module';
import { atendimentoRouter } from '../modules/atendimento/atendimento.module';
import { dashboardRouter } from '../modules/dashboard/dashboard.module';
import { agendamentoMensagensRouter } from '../modules/agendamento-mensagens/agendamento-mensagens.module';
import { notificacaoRouter } from '../modules/notificacoes/notificacao.module';
import { quickMessageRouter } from '../modules/quick-messages/quick-messages.module';
import { botRouter } from '../modules/bots/bots.module';
import { etiquetaRouter } from '../modules/etiquetas/etiqueta.module';
import { filaRouter } from '../modules/filas/fila.module';
import { achievementsRouter } from '../modules/achievements/achievements.module';
import { usuarioRouter } from '../modules/usuarios/usuario.module';
import { meuPerfilRouter } from '../modules/meu-perfil/meu-perfil.module';
import { pesquisaRouter } from '../modules/pesquisas/pesquisa.module';
import { produtoRouter } from '../modules/produtos/produto.module';
import { cupomRouter } from '../modules/cupons/cupom.module';
import { campanhaRouter } from '../modules/campanhas/campanha.module';
import { integracaoRouter } from '../modules/integracoes/integracao.module';
import { agendaRouter } from '../modules/agenda/agenda.module';
import { tarefasRouter } from '../modules/tarefas/tarefas.module';
import { configuracaoGeralRouter } from '../modules/configuracao-geral/configuracao-geral.module';
import { apiMessagesRouter } from '../modules/api-messages/api-messages.module';
import { reportsRouter, reportTicketsRouter } from '../modules/reports/reports.module';
import { crmConfigRouter, crmReportsRouter, crmTimelineRouter } from '../modules/crm/crm.module';
import { superadminRouter } from '../modules/superadmin/superadmin.module';
import { recordHttpRequest } from '../modules/monitoring/monitoring.metrics';
import { monitoringRouter } from '../modules/monitoring/monitoring.module';

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
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
        // Corpo cru guardado para webhooks assinados (WuzAPI confere HMAC dos bytes exatos)
        (req as typeof req & { rawBody?: string }).rawBody = body as string;
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
        // Em teste, contador em memória por instância: no Redis ele seria somado
        // entre todos os arquivos da suíte e estouraria o limite no meio dela.
        ...(redis && env.NODE_ENV !== 'test' ? { redis } : {}),
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
        // helmet marca tudo como Cross-Origin-Resource-Policy: same-origin por padrão,
        // o que bloqueia o navegador de carregar essas imagens quando o front (outro
        // domínio/porta) tenta exibi-las em <img>. Esses arquivos são públicos por
        // natureza (avatar, mídia de mensagens), então liberamos o embed cross-origin.
        setHeaders: (res) => {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
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

    app.register(monitoringRouter.register);

    // ── Abertos ao atendente (perfil user) ───────────────────────────────────
    app.register(authRouter.register, { prefix: '/api/v1/auth' });
    app.register(whatsappRoutes, { prefix: '/api/v1/whatsapp' });
    app.register(whatsappOficialRouter.register, { prefix: '/api/v1/whatsapp-oficial' });
    app.register(atendimentoRouter.register, { prefix: '/api/v1/atendimento' });
    app.register(dashboardRouter.register, { prefix: '/api/v1/atendimento' });
    app.register(agendamentoMensagensRouter.register, { prefix: '/api/v1/atendimento' });
    app.register(notificacaoRouter.register, { prefix: '/api/v1/notifications' });
    app.register(quickMessageRouter.register, { prefix: '/api/v1/configuracao/quick-messages' });
    app.register(etiquetaRouter.register, { prefix: '/api/v1' });
    app.register(filaRouter.register, { prefix: '/api/v1/configuracao/filas' });
    app.register(achievementsRouter.register, { prefix: '/api/v1/achievements' });
    app.register(tarefasRouter.register, { prefix: '/api/v1/tarefas' });
    app.register(meuPerfilRouter.register, { prefix: '/api/v1/configuracao/meu-perfil' });

    // ── Restritos a admin/superAdmin ─────────────────────────────────────────
    app.register(botRouter.register, { prefix: '/api/v1/bots' });
    app.register(usuarioRouter.register, { prefix: '/api/v1/configuracao/usuarios' });
    app.register(pesquisaRouter.register, { prefix: '/api/v1/configuracao/pesquisas' });
    app.register(campanhaRouter.register, { prefix: '/api/v1/configuracao/mensagens-agendadas' });
    app.register(produtoRouter.register, { prefix: '/api/v1/configuracao/produtos' });
    app.register(cupomRouter.register, { prefix: '/api/v1/configuracao/cupons' });
    // integracoes NÃO usa adminOnly: /google/callback é público (redirect OAuth do Google).
    // O gating admin é feito por-rota dentro de integracao.routes.ts.
    app.register(integracaoRouter.register, { prefix: '/api/v1/integracoes' });
    // api-messages NÃO usa adminOnly: /send é público, autenticado por X-Api-Key
    // (chamado por sistemas externos, não por usuário logado). O gating admin
    // das rotas de gestão da chave é feito por-rota dentro de api-messages.routes.ts.
    app.register(apiMessagesRouter.register, { prefix: '/api/v1' });
    app.register(agendaRouter.register, { prefix: '/api/v1/agenda' });
    // configuracaoGeralRoutes NÃO usa adminOnly: GET é liberado pra qualquer
    // usuário autenticado (useCompanyPermissions precisa disso pro app inteiro),
    // o gating admin do PUT é feito por-rota dentro de configuracao-geral.routes.ts.
    app.register(configuracaoGeralRouter.register, { prefix: '/api/v1/configuracao/configuracoes-gerais' });
    app.register(reportsRouter.register,       { prefix: '/api/v1/reports' });
    app.register(reportTicketsRouter.register, { prefix: '/api/v1/reporttickets' });
    app.register(crmReportsRouter.register, { prefix: '/api/v1/crm-reports' });
    app.register(crmConfigRouter.register, { prefix: '/api/v1/crm' });
    app.register(crmTimelineRouter.register, { prefix: '/api/v1' });
    app.register(superadminRouter.register, { prefix: '/api/v1/superadmin' });

    // Webhook da API Oficial do WhatsApp (Cloud API) — chamado pela META.
    // GET = verificação (hub.challenge); POST = eventos (messages/statuses).
    // Sem login: o handshake confere o hub.verify_token e os eventos, a assinatura
    // da Meta (quando WAB_APP_SECRET está configurado). Fora do rate limit.
    app.register(cloudWebhookRouter.register);

    // Webhook da WuzAPI (motor alternativo ao bays) — autenticado por HMAC da conexão.
    // Fica fora do rate limit: mensagens de muitos contatos chegam em rajada pelo mesmo IP.
    app.post('/wuzapi/webhook/:id', { config: { rateLimit: false } }, wuzapiWebhook);

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
    app.get('/connection', baysAuth, whatsappController.getActiveSessions);

    // Baileys auth-session persistence (bays calls these to save/restore credentials)
    // Stored in Redis under baileys:auth:{prefix}:{key}
    // Protegidas por secretkey (baysAuth) — sem isso, qualquer pessoa na internet
    // conseguia ler/apagar as credenciais de sessão do WhatsApp de qualquer empresa.
    app.get('/auth-sessions', baysAuth, async (_req, reply) => {
        const redis = getRedisClient();
        if (!redis) return reply.send({ prefixes: [] });
        const keys = await redis.keys('baileys:auth:*');
        const prefixes = [...new Set(keys.map((k: string) => k.split(':').slice(2, -1).join(':')))];
        return reply.send({ prefixes });
    });
    app.put('/auth-sessions', baysAuth, async (req, reply) => {
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
    app.get('/auth-sessions/:prefix/:key', baysAuth, async (req, reply) => {
        const { prefix, key } = req.params as { prefix: string; key: string };
        const redis = getRedisClient();
        if (!redis) return reply.status(404).send({ value: null });
        const value = await redis.get(`baileys:auth:${prefix}:${key}`);
        if (value == null) return reply.status(404).send({ value: null });
        return reply.send({ value });
    });
    app.delete('/auth-sessions/:prefix/:key', baysAuth, async (req, reply) => {
        const { prefix, key } = req.params as { prefix: string; key: string };
        const redis = getRedisClient();
        if (redis) await redis.del(`baileys:auth:${prefix}:${key}`);
        return reply.send({ ok: true });
    });
    app.delete('/auth-sessions/:prefix', baysAuth, async (req, reply) => {
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

    // Endpoint interno — chamado pelo microsserviço campaigns pra entregar o disparo
    app.post(
        '/api/internal/send-text-by-connection',
        { preHandler: internalAuthMiddleware },
        whatsappController.sendTextByConnection
    );

    registerRequestLogger(app);
    app.setErrorHandler(errorHandler);

    return app;
}
