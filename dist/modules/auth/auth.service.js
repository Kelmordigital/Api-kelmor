"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountService = exports.AuthenticationService = exports.SESSION_TTL_SECONDS = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const pg_errors_1 = require("../../core/database/pg-errors");
const account_status_policy_1 = require("./account-status-policy");
exports.SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const INVALID_CREDENTIALS = 'Usuário ou senha inválido';
const INVALID_TICKET = 'Sessão de verificação inválida ou expirada. Faça login novamente.';
const SESSION_ENDED = 'Sessão encerrada. Faça login novamente.';
const TICKET_TTL_SECONDS = 300;
/**
 * Entrar, renovar e sair. Uma sessão só nasce (ou se renova) para conta
 * liberada pela AccountStatusPolicy; com 2FA ativo, a senha sozinha não basta.
 */
class AuthenticationService {
    repository;
    hasher;
    tokens;
    sessions;
    twoFactor;
    usedTickets;
    /** Hash qualquer, para o "usuário não existe" levar o mesmo tempo que "senha errada". */
    decoyHash;
    constructor(repository, hasher, tokens, sessions, twoFactor, usedTickets) {
        this.repository = repository;
        this.hasher = hasher;
        this.tokens = tokens;
        this.sessions = sessions;
        this.twoFactor = twoFactor;
        this.usedTickets = usedTickets;
        this.decoyHash = hasher.hash('kelmor-decoy-password');
    }
    async login(email, password) {
        const user = await this.repository.findByEmailWithProfile(email);
        const passwordOk = await this.hasher.verify(password, user?.password_hash ?? await this.decoyHash);
        if (!user || !passwordOk)
            throw new http_errors_1.UnauthorizedError(INVALID_CREDENTIALS);
        const block = await account_status_policy_1.AccountStatusPolicy.blockOf(user, () => this.repository.isCompanyActive(user.company_id));
        if (block)
            throw new http_errors_1.ForbiddenError(account_status_policy_1.LOGIN_BLOCK_MESSAGES[block]);
        if (user.totp_enabled)
            return { kind: 'totp_required', ticket: this.tokens.totpTicket(user.id) };
        return { kind: 'session', grant: await this.issue(user) };
    }
    /** Passo 2 do login com 2FA: o ticket vale uma única vez. */
    async completeTotpLogin(ticket, code) {
        const payload = this.tokens.verifyTotpTicket(ticket);
        if (!payload)
            throw new http_errors_1.UnauthorizedError(INVALID_TICKET);
        this.twoFactor.assertAvailable();
        if (await this.usedTickets.get(AuthenticationService.ticketKey(payload.jti)))
            throw new http_errors_1.UnauthorizedError(INVALID_TICKET);
        const user = await this.repository.findByIdWithProfile(payload.sub);
        if (!user || !user.totp_enabled)
            throw new http_errors_1.UnauthorizedError(INVALID_TICKET);
        if (!(await this.twoFactor.verifyLoginCode(user.id, code)))
            throw new http_errors_1.UnauthorizedError('Código inválido');
        // Consumo atômico: requisições simultâneas com o mesmo ticket não geram duas sessões
        if (!(await this.usedTickets.setIfAbsent(AuthenticationService.ticketKey(payload.jti), '1', TICKET_TTL_SECONDS))) {
            throw new http_errors_1.UnauthorizedError(INVALID_TICKET);
        }
        return this.issue(user);
    }
    /** Troca o refresh token por um novo (rotação) e devolve um access token novo. */
    async refresh(refreshToken) {
        const payload = this.tokens.verifyRefresh(refreshToken);
        if (!payload)
            throw new http_errors_1.UnauthorizedError('Refresh token inválido ou expirado');
        if (!(await this.repository.hasRefreshToken(refreshToken)))
            throw new http_errors_1.UnauthorizedError('Refresh token revogado');
        const user = await this.repository.findByIdWithProfile(payload.sub);
        if (!user)
            throw new http_errors_1.UnauthorizedError('Usuário não encontrado');
        if (await account_status_policy_1.AccountStatusPolicy.blockOf(user, () => this.repository.isCompanyActive(user.company_id))) {
            throw new http_errors_1.UnauthorizedError(SESSION_ENDED);
        }
        await this.repository.deleteRefreshToken(refreshToken);
        const next = this.tokens.refresh(user.id);
        await this.repository.saveRefreshToken(user.id, next, AuthenticationService.refreshExpiry());
        // Recria a sessão no Redis — necessário se ele foi reiniciado ou se outra aba saiu
        await this.sessions.open(user.profile_tag, user.company_id, user.id, exports.SESSION_TTL_SECONDS);
        return { accessToken: this.accessFor(user), refreshToken: next };
    }
    /** Apaga o refresh token e encerra a sessão: o access token em uso deixa de valer na hora. */
    async logout(refreshToken) {
        const owner = this.tokens.verifyRefresh(refreshToken);
        await this.repository.deleteRefreshToken(refreshToken);
        if (!owner)
            return;
        const user = await this.repository.findByIdWithProfile(owner.sub);
        if (user)
            await this.sessions.revoke(user.company_id, user.id);
    }
    async me(userId) {
        const user = await this.repository.findByIdWithProfile(userId);
        if (!user)
            throw new http_errors_1.NotFoundError('Usuário não encontrado');
        // Quantas filas/conexões o usuário tem — o front avisa quem não recebe atendimentos
        const counts = await this.repository.assignmentCounts(user.id);
        return {
            id: user.id, name: user.name, email: user.email, profile_id: user.profile_id, profile_tag: user.profile_tag,
            company_id: user.company_id, email_verified: user.email_verified, is_approved: user.is_approved,
            finance: user.finance, totp_enabled: user.totp_enabled, avatar_url: user.avatar_url,
            hide_name_active: user.hide_name_active, queue_count: counts.queues, connection_count: counts.connections,
        };
    }
    async issue(user) {
        const refreshToken = this.tokens.refresh(user.id);
        await this.repository.saveRefreshToken(user.id, refreshToken, AuthenticationService.refreshExpiry());
        await this.sessions.open(user.profile_tag, user.company_id, user.id, exports.SESSION_TTL_SECONDS);
        return {
            accessToken: this.accessFor(user),
            refreshToken,
            user: {
                id: user.id, name: user.name, email: user.email, profile_tag: user.profile_tag, company_id: user.company_id,
                finance: user.finance, totp_enabled: user.totp_enabled, avatar_url: user.avatar_url, hide_name_active: user.hide_name_active,
            },
        };
    }
    accessFor(user) {
        return this.tokens.access({
            sub: user.id, email: user.email, company_id: user.company_id, profile_tag: user.profile_tag, finance: user.finance,
        });
    }
    static refreshExpiry() {
        return new Date(Date.now() + exports.SESSION_TTL_SECONDS * 1000);
    }
    static ticketKey(jti) {
        return `totp:used:${jti}`;
    }
}
exports.AuthenticationService = AuthenticationService;
/** Criação de contas pela chave de administração do sistema e aprovação pelo superAdmin. */
class AccountService {
    repository;
    hasher;
    constructor(repository, hasher) {
        this.repository = repository;
        this.hasher = hasher;
    }
    async register(input) {
        // Trava: nunca criar outro superAdmin (só existe 1 no sistema, criado pelo seed)
        if (input.profile_id === 3)
            throw new http_errors_1.BadRequestError('Não é permitido criar usuários superAdmin');
        if (input.company_id && !(await this.repository.companyExists(input.company_id))) {
            throw new http_errors_1.BadRequestError('Empresa não encontrada');
        }
        if (await this.repository.isEmailTaken(input.email))
            throw new http_errors_1.ConflictError('Email já cadastrado');
        try {
            const user = await this.repository.create({
                name: input.name,
                email: input.email,
                password_hash: await this.hasher.hash(input.password),
                profile_id: input.profile_id,
                company_id: input.company_id ?? null,
            });
            return { id: user.id, name: user.name, email: user.email, profile_id: user.profile_id, company_id: user.company_id, is_approved: user.is_approved };
        }
        catch (err) {
            if ((0, pg_errors_1.isUniqueViolation)(err))
                throw new http_errors_1.ConflictError('Email já cadastrado');
            throw err;
        }
    }
    async approve(userId) {
        const user = await this.repository.approve(userId);
        if (!user)
            throw new http_errors_1.NotFoundError('Usuário não encontrado');
        return user;
    }
}
exports.AccountService = AccountService;
//# sourceMappingURL=auth.service.js.map