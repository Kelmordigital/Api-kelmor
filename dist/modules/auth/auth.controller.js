"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const schema_validator_1 = require("../../core/validation/schema-validator");
const auth_dto_1 = require("./auth.dto");
const auth_service_1 = require("./auth.service");
const REFRESH_COOKIE = 'refresh_token';
const REFRESH_PATH = '/api/v1/auth/refresh';
/** Adapta HTTP ⇄ autenticação. Cuida só de corpo, status e do cookie do refresh token. */
class AuthController {
    auth;
    accounts;
    twoFactor;
    secureCookies;
    constructor(auth, accounts, twoFactor, secureCookies) {
        this.auth = auth;
        this.accounts = accounts;
        this.twoFactor = twoFactor;
        this.secureCookies = secureCookies;
    }
    login = async (req, reply) => {
        const { email, password } = auth_dto_1.loginSchema.parse(req.body);
        const result = await this.auth.login(email, password);
        // 2FA: senha correta sozinha não emite sessão — pede o código do autenticador
        if (result.kind === 'totp_required')
            return reply.send({ requires_totp: true, totp_ticket: result.ticket });
        return this.sendSession(reply, result.grant);
    };
    loginTotp = async (req, reply) => {
        const { ticket, code } = auth_dto_1.loginTotpSchema.parse(req.body);
        return this.sendSession(reply, await this.auth.completeTotpLogin(ticket, code));
    };
    refresh = async (req, reply) => {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (!token)
            throw new http_errors_1.UnauthorizedError('Refresh token não fornecido');
        const { accessToken, refreshToken } = await this.auth.refresh(token);
        this.setRefreshCookie(reply, refreshToken);
        return reply.send({ access_token: accessToken });
    };
    logout = async (req, reply) => {
        const token = req.cookies?.[REFRESH_COOKIE];
        if (token) {
            await this.auth.logout(token);
            reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH });
        }
        return reply.send({ message: 'Logout realizado com sucesso' });
    };
    me = async (req, reply) => reply.send(await this.auth.me(req.user.id));
    register = async (req, reply) => {
        return reply.status(201).send(await this.accounts.register(auth_dto_1.registerSchema.parse(req.body)));
    };
    approve = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(auth_dto_1.userIdParamsSchema, req.params);
        return reply.send({ message: 'Usuário aprovado com sucesso', user: await this.accounts.approve(id) });
    };
    totpSetup = async (req, reply) => reply.send(await this.twoFactor.setup(req.user.id, req.user.email));
    totpEnable = async (req, reply) => {
        const { code } = auth_dto_1.totpCodeSchema.parse(req.body);
        return reply.send({ recovery_codes: await this.twoFactor.enable(req.user.id, code) });
    };
    totpDisable = async (req, reply) => {
        const { code } = auth_dto_1.totpCodeSchema.parse(req.body);
        await this.twoFactor.disable(req.user.id, code);
        return reply.send({ message: 'Verificação em duas etapas desativada' });
    };
    sendSession(reply, grant) {
        this.setRefreshCookie(reply, grant.refreshToken);
        return reply.send({ access_token: grant.accessToken, user: grant.user });
    }
    setRefreshCookie(reply, token) {
        reply.setCookie(REFRESH_COOKIE, token, {
            httpOnly: true,
            secure: this.secureCookies,
            sameSite: 'strict',
            path: REFRESH_PATH,
            maxAge: auth_service_1.SESSION_TTL_SECONDS,
        });
    }
}
exports.AuthController = AuthController;
//# sourceMappingURL=auth.controller.js.map