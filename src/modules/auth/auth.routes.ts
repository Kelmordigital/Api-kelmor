import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/http-errors';
import type { HttpRouter } from '../../core/http/http-router';
import { publicApiErrorBody } from '../../core/http/public-api-error';
import { adminMiddleware, authMiddleware, requireSuperAdmin } from '../../middlewares/auth.middleware';
import { errorHandler } from '../../middlewares/error.middleware';
import type { AuthController } from './auth.controller';

/**
 * Autenticação. Os erros saem no formato `{ statusCode, error, message }` —
 * contrato do login com o front, o app desktop e as integrações.
 */
export class AuthRouter implements HttpRouter {
    constructor(
        private readonly controller: AuthController,
        /** 5 tentativas/min por IP contra força bruta (desligado na suíte de testes). */
        private readonly bruteForceLimit: boolean,
    ) {}

    register = async (app: FastifyInstance) => {
        app.setErrorHandler((error, req, reply) => {
            if (error instanceof AppError) return reply.status(error.statusCode).send(publicApiErrorBody(error));
            return errorHandler(error as Error, req, reply);
        });

        const c = this.controller;
        const limited = this.bruteForceLimit ? { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } } : {};
        const superGuard = { preHandler: [authMiddleware, requireSuperAdmin] };

        app.post('/register',   { preHandler: adminMiddleware }, c.register);
        app.post('/login',      limited, c.login);
        app.post('/login/totp', limited, c.loginTotp);
        app.post('/refresh',    c.refresh);
        app.delete('/logout',   c.logout);
        app.get('/me',          { preHandler: authMiddleware }, c.me);
        app.patch('/approve/:id', superGuard, c.approve);

        // enable/disable conferem códigos → mesmo limite do login contra força bruta
        app.get('/totp/setup',    superGuard, c.totpSetup);
        app.post('/totp/enable',  { ...superGuard, ...limited }, c.totpEnable);
        app.post('/totp/disable', { ...superGuard, ...limited }, c.totpDisable);
    };
}
