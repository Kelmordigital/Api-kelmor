import { FastifyInstance } from 'fastify';
import { authController } from './auth.controller';
import { adminMiddleware, authMiddleware, requireSuperAdmin } from '../../middlewares/auth.middleware';
import { env } from '../../config/env';

export async function authRoutes(app: FastifyInstance) {
    // 5 tentativas/min por IP contra força bruta; na suíte de testes fica desligado
    const loginLimit = env.NODE_ENV === 'test'
        ? {}
        : { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };

    app.post('/register', { preHandler: adminMiddleware }, authController.register);
    app.post('/login',      loginLimit, authController.login);
    app.post('/login/totp', loginLimit, authController.loginTotp);
    app.post('/refresh', authController.refresh);
    app.delete('/logout', authController.logout);
    app.get('/me', { preHandler: authMiddleware }, authController.me);
    app.patch('/approve/:id', { preHandler: [authMiddleware, requireSuperAdmin] }, authController.approve);

    const superGuard = { preHandler: [authMiddleware, requireSuperAdmin] };
    // enable/disable verificam códigos → mesmo rate limit do login contra força bruta
    app.get('/totp/setup',    superGuard, authController.totpSetup);
    app.post('/totp/enable',  { ...superGuard, ...loginLimit }, authController.totpEnable);
    app.post('/totp/disable', { ...superGuard, ...loginLimit }, authController.totpDisable);
}
