import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { AuthController } from './auth.controller';
/**
 * Autenticação. Os erros saem no formato `{ statusCode, error, message }` —
 * contrato do login com o front, o app desktop e as integrações.
 */
export declare class AuthRouter implements HttpRouter {
    private readonly controller;
    /** 5 tentativas/min por IP contra força bruta (desligado na suíte de testes). */
    private readonly bruteForceLimit;
    constructor(controller: AuthController, 
    /** 5 tentativas/min por IP contra força bruta (desligado na suíte de testes). */
    bruteForceLimit: boolean);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=auth.routes.d.ts.map