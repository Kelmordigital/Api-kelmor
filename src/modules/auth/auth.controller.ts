import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../../core/errors/http-errors';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { loginSchema, loginTotpSchema, registerSchema, totpCodeSchema, userIdParamsSchema } from './auth.dto';
import { SESSION_TTL_SECONDS, type AccountService, type AuthenticationService, type SessionGrant } from './auth.service';
import type { TwoFactorService } from './two-factor.service';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_PATH = '/api/v1/auth/refresh';

/** Adapta HTTP ⇄ autenticação. Cuida só de corpo, status e do cookie do refresh token. */
export class AuthController {
    constructor(
        private readonly auth: AuthenticationService,
        private readonly accounts: AccountService,
        private readonly twoFactor: TwoFactorService,
        private readonly secureCookies: boolean,
    ) {}

    login = async (req: FastifyRequest, reply: FastifyReply) => {
        const { email, password } = loginSchema.parse(req.body);
        const result = await this.auth.login(email, password);
        // 2FA: senha correta sozinha não emite sessão — pede o código do autenticador
        if (result.kind === 'totp_required') return reply.send({ requires_totp: true, totp_ticket: result.ticket });
        return this.sendSession(reply, result.grant);
    };

    loginTotp = async (req: FastifyRequest, reply: FastifyReply) => {
        const { ticket, code } = loginTotpSchema.parse(req.body);
        return this.sendSession(reply, await this.auth.completeTotpLogin(ticket, code));
    };

    refresh = async (req: FastifyRequest, reply: FastifyReply) => {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (!token) throw new UnauthorizedError('Refresh token não fornecido');
        const { accessToken, refreshToken } = await this.auth.refresh(token);
        this.setRefreshCookie(reply, refreshToken);
        return reply.send({ access_token: accessToken });
    };

    logout = async (req: FastifyRequest, reply: FastifyReply) => {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (token) {
            await this.auth.logout(token);
            reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
        }
        return reply.send({ message: 'Logout realizado com sucesso' });
    };

    me = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.auth.me(req.user.id));

    register = async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.status(201).send(await this.accounts.register(registerSchema.parse(req.body)));
    };

    approve = async (req: FastifyRequest, reply: FastifyReply) => {
        const { id } = SchemaValidator.parse(userIdParamsSchema, req.params);
        return reply.send({ message: 'Usuário aprovado com sucesso', user: await this.accounts.approve(id) });
    };

    totpSetup = async (req: FastifyRequest, reply: FastifyReply) => reply.send(await this.twoFactor.setup(req.user.id, req.user.email));

    totpEnable = async (req: FastifyRequest, reply: FastifyReply) => {
        const { code } = totpCodeSchema.parse(req.body);
        return reply.send({ recovery_codes: await this.twoFactor.enable(req.user.id, code) });
    };

    totpDisable = async (req: FastifyRequest, reply: FastifyReply) => {
        const { code } = totpCodeSchema.parse(req.body);
        await this.twoFactor.disable(req.user.id, code);
        return reply.send({ message: 'Verificação em duas etapas desativada' });
    };

    private sendSession(reply: FastifyReply, grant: SessionGrant) {
        this.setRefreshCookie(reply, grant.refreshToken);
        return reply.send({ access_token: grant.accessToken, user: grant.user });
    }

    private setRefreshCookie(reply: FastifyReply, token: string) {
        reply.setCookie(REFRESH_COOKIE, token, {
            httpOnly: true,
            secure: this.secureCookies,
            sameSite: 'strict',
            path: REFRESH_PATH,
            maxAge: SESSION_TTL_SECONDS,
        });
    }
}
