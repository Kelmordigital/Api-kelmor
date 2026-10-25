"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthRouter = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const public_api_error_1 = require("../../core/http/public-api-error");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const error_middleware_1 = require("../../middlewares/error.middleware");
/**
 * Autenticação. Os erros saem no formato `{ statusCode, error, message }` —
 * contrato do login com o front, o app desktop e as integrações.
 */
class AuthRouter {
    controller;
    bruteForceLimit;
    constructor(controller, 
    /** 5 tentativas/min por IP contra força bruta (desligado na suíte de testes). */
    bruteForceLimit) {
        this.controller = controller;
        this.bruteForceLimit = bruteForceLimit;
    }
    register = async (app) => {
        app.setErrorHandler((error, req, reply) => {
            if (error instanceof http_errors_1.AppError)
                return reply.status(error.statusCode).send((0, public_api_error_1.publicApiErrorBody)(error));
            return (0, error_middleware_1.errorHandler)(error, req, reply);
        });
        const c = this.controller;
        const limited = this.bruteForceLimit ? { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } } : {};
        const superGuard = { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireSuperAdmin] };
        app.post('/register', { preHandler: auth_middleware_1.adminMiddleware }, c.register);
        app.post('/login', limited, c.login);
        app.post('/login/totp', limited, c.loginTotp);
        app.post('/refresh', c.refresh);
        app.delete('/logout', c.logout);
        app.get('/me', { preHandler: auth_middleware_1.authMiddleware }, c.me);
        app.patch('/approve/:id', superGuard, c.approve);
        // enable/disable conferem códigos → mesmo limite do login contra força bruta
        app.get('/totp/setup', superGuard, c.totpSetup);
        app.post('/totp/enable', { ...superGuard, ...limited }, c.totpEnable);
        app.post('/totp/disable', { ...superGuard, ...limited }, c.totpDisable);
    };
}
exports.AuthRouter = AuthRouter;
//# sourceMappingURL=auth.routes.js.map