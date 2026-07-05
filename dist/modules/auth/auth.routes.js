"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const auth_controller_1 = require("./auth.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const env_1 = require("../../config/env");
async function authRoutes(app) {
    // 5 tentativas/min por IP contra força bruta; na suíte de testes fica desligado
    const loginLimit = env_1.env.NODE_ENV === 'test'
        ? {}
        : { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };
    app.post('/register', { preHandler: auth_middleware_1.adminMiddleware }, auth_controller_1.authController.register);
    app.post('/login', loginLimit, auth_controller_1.authController.login);
    app.post('/login/totp', loginLimit, auth_controller_1.authController.loginTotp);
    app.post('/refresh', auth_controller_1.authController.refresh);
    app.delete('/logout', auth_controller_1.authController.logout);
    app.get('/me', { preHandler: auth_middleware_1.authMiddleware }, auth_controller_1.authController.me);
    app.patch('/approve/:id', { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireSuperAdmin] }, auth_controller_1.authController.approve);
    const superGuard = { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireSuperAdmin] };
    // enable/disable verificam códigos → mesmo rate limit do login contra força bruta
    app.get('/totp/setup', superGuard, auth_controller_1.authController.totpSetup);
    app.post('/totp/enable', { ...superGuard, ...loginLimit }, auth_controller_1.authController.totpEnable);
    app.post('/totp/disable', { ...superGuard, ...loginLimit }, auth_controller_1.authController.totpDisable);
}
//# sourceMappingURL=auth.routes.js.map