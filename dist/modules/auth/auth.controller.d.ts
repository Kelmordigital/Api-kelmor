import type { FastifyRequest, FastifyReply } from 'fastify';
import { type AccountService, type AuthenticationService } from './auth.service';
import type { TwoFactorService } from './two-factor.service';
/** Adapta HTTP ⇄ autenticação. Cuida só de corpo, status e do cookie do refresh token. */
export declare class AuthController {
    private readonly auth;
    private readonly accounts;
    private readonly twoFactor;
    private readonly secureCookies;
    constructor(auth: AuthenticationService, accounts: AccountService, twoFactor: TwoFactorService, secureCookies: boolean);
    login: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    loginTotp: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    refresh: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    logout: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    me: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    register: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    approve: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    totpSetup: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    totpEnable: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    totpDisable: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    private sendSession;
    private setRefreshCookie;
}
//# sourceMappingURL=auth.controller.d.ts.map