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
const env_1 = require("../config/env");
const redis_1 = require("../config/redis");
const error_middleware_1 = require("../middlewares/error.middleware");
const logger_middleware_1 = require("../middlewares/logger.middleware");
const auth_routes_1 = require("../modules/auth/auth.routes");
function buildApp() {
    const app = (0, fastify_1.default)({
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
    app.register(helmet_1.default);
    const redis = (0, redis_1.getRedisClient)();
    app.register(rate_limit_1.default, {
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
    app.register(cookie_1.default, { secret: env_1.env.REFRESH_SECRET });
    app.register(cors_1.default, {
        origin: env_1.env.FRONTEND_URL,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    });
    app.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        env: env_1.env.NODE_ENV,
    }));
    app.register(auth_routes_1.authRoutes, { prefix: '/api/v1/auth' });
    (0, logger_middleware_1.registerRequestLogger)(app);
    app.setErrorHandler(error_middleware_1.errorHandler);
    return app;
}
//# sourceMappingURL=server.js.map