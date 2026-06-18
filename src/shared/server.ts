import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { env } from '../config/env';
import { getRedisClient } from '../config/redis';
import { errorHandler } from '../middlewares/error.middleware';
import { registerRequestLogger } from '../middlewares/logger.middleware';
import { authRoutes } from '../modules/auth/auth.routes';

export function buildApp() {
    const app = Fastify({
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

    app.register(helmet);

    const redis = getRedisClient();
    app.register(rateLimit, {
        global: true,
        max: 200,
        timeWindow: '1 minute',
        ...(redis ? { redis } : {}),
        keyGenerator: (request) => request.ip,
        errorResponseBuilder: (_request, context) => ({
            statusCode: 429,
            error: 'Too Many Requests',
            message: `Limite de requisições atingido. Aguarde ${Math.ceil(context.ttl / 1000)} segundo(s).`,
        }),
    });

    app.register(cookie, { secret: env.REFRESH_SECRET });

    app.register(cors, {
        origin: env.FRONTEND_URL,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });

    app.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: env.NODE_ENV,
    }));

    app.register(authRoutes, { prefix: '/api/v1/auth' });

    registerRequestLogger(app);
    app.setErrorHandler(errorHandler);

    return app;
}
