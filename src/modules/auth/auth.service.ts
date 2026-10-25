import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../core/errors/http-errors';
import type { PasswordHasher } from '../../core/auth/password-hasher';
import type { SessionStore } from '../../core/auth/session';
import { isUniqueViolation } from '../../core/database/pg-errors';
import type { AuthRepository, UserWithProfile } from './auth.repository';
import type { TokenService } from './auth.tokens';
import type { EphemeralStore, TwoFactorService } from './two-factor.service';
import { AccountStatusPolicy, LOGIN_BLOCK_MESSAGES } from './account-status-policy';
import type { RegisterInput } from './auth.dto';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Sessão emitida: o access token vai no corpo, o refresh token num cookie httpOnly. */
export interface SessionGrant {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string; name: string; email: string; profile_tag: string; company_id: string | null;
        finance: boolean; totp_enabled: boolean; avatar_url: string | null; hide_name_active: boolean;
    };
}

export type LoginResult =
    | { kind: 'session'; grant: SessionGrant }
    | { kind: 'totp_required'; ticket: string };

const INVALID_CREDENTIALS = 'Usuário ou senha inválido';
const INVALID_TICKET = 'Sessão de verificação inválida ou expirada. Faça login novamente.';
const SESSION_ENDED = 'Sessão encerrada. Faça login novamente.';
const TICKET_TTL_SECONDS = 300;

/**
 * Entrar, renovar e sair. Uma sessão só nasce (ou se renova) para conta
 * liberada pela AccountStatusPolicy; com 2FA ativo, a senha sozinha não basta.
 */
export class AuthenticationService {
    /** Hash qualquer, para o "usuário não existe" levar o mesmo tempo que "senha errada". */
    private readonly decoyHash: Promise<string>;

    constructor(
        private readonly repository: AuthRepository,
        private readonly hasher: PasswordHasher,
        private readonly tokens: TokenService,
        private readonly sessions: SessionStore,
        private readonly twoFactor: TwoFactorService,
        private readonly usedTickets: EphemeralStore,
    ) {
        this.decoyHash = hasher.hash('kelmor-decoy-password');
    }

    async login(email: string, password: string): Promise<LoginResult> {
        const user = await this.repository.findByEmailWithProfile(email);
        const passwordOk = await this.hasher.verify(password, user?.password_hash ?? await this.decoyHash);
        if (!user || !passwordOk) throw new UnauthorizedError(INVALID_CREDENTIALS);

        const block = await AccountStatusPolicy.blockOf(user, () => this.repository.isCompanyActive(user.company_id!));
        if (block) throw new ForbiddenError(LOGIN_BLOCK_MESSAGES[block]);

        if (user.totp_enabled) return { kind: 'totp_required', ticket: this.tokens.totpTicket(user.id) };
        return { kind: 'session', grant: await this.issue(user) };
    }

    /** Passo 2 do login com 2FA: o ticket vale uma única vez. */
    async completeTotpLogin(ticket: string, code: string): Promise<SessionGrant> {
        const payload = this.tokens.verifyTotpTicket(ticket);
        if (!payload) throw new UnauthorizedError(INVALID_TICKET);
        this.twoFactor.assertAvailable();
        if (await this.usedTickets.get(AuthenticationService.ticketKey(payload.jti))) throw new UnauthorizedError(INVALID_TICKET);

        const user = await this.repository.findByIdWithProfile(payload.sub);
        if (!user || !user.totp_enabled) throw new UnauthorizedError(INVALID_TICKET);
        if (!(await this.twoFactor.verifyLoginCode(user.id, code))) throw new UnauthorizedError('Código inválido');

        // Consumo atômico: requisições simultâneas com o mesmo ticket não geram duas sessões
        if (!(await this.usedTickets.setIfAbsent(AuthenticationService.ticketKey(payload.jti), '1', TICKET_TTL_SECONDS))) {
            throw new UnauthorizedError(INVALID_TICKET);
        }
        return this.issue(user);
    }

    /** Troca o refresh token por um novo (rotação) e devolve um access token novo. */
    async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
        const payload = this.tokens.verifyRefresh(refreshToken);
        if (!payload) throw new UnauthorizedError('Refresh token inválido ou expirado');
        if (!(await this.repository.hasRefreshToken(refreshToken))) throw new UnauthorizedError('Refresh token revogado');

        const user = await this.repository.findByIdWithProfile(payload.sub);
        if (!user) throw new UnauthorizedError('Usuário não encontrado');
        if (await AccountStatusPolicy.blockOf(user, () => this.repository.isCompanyActive(user.company_id!))) {
            throw new UnauthorizedError(SESSION_ENDED);
        }

        await this.repository.deleteRefreshToken(refreshToken);
        const next = this.tokens.refresh(user.id);
        await this.repository.saveRefreshToken(user.id, next, AuthenticationService.refreshExpiry());
        // Recria a sessão no Redis — necessário se ele foi reiniciado ou se outra aba saiu
        await this.sessions.open(user.profile_tag, user.company_id, user.id, SESSION_TTL_SECONDS);
        return { accessToken: this.accessFor(user), refreshToken: next };
    }

    /** Apaga o refresh token e encerra a sessão: o access token em uso deixa de valer na hora. */
    async logout(refreshToken: string): Promise<void> {
        const owner = this.tokens.verifyRefresh(refreshToken);
        await this.repository.deleteRefreshToken(refreshToken);
        if (!owner) return;
        const user = await this.repository.findByIdWithProfile(owner.sub);
        if (user) await this.sessions.revoke(user.company_id, user.id);
    }

    async me(userId: string) {
        const user = await this.repository.findByIdWithProfile(userId);
        if (!user) throw new NotFoundError('Usuário não encontrado');
        // Quantas filas/conexões o usuário tem — o front avisa quem não recebe atendimentos
        const counts = await this.repository.assignmentCounts(user.id);
        return {
            id: user.id, name: user.name, email: user.email, profile_id: user.profile_id, profile_tag: user.profile_tag,
            company_id: user.company_id, email_verified: user.email_verified, is_approved: user.is_approved,
            finance: user.finance, totp_enabled: user.totp_enabled, avatar_url: user.avatar_url,
            hide_name_active: user.hide_name_active, queue_count: counts.queues, connection_count: counts.connections,
        };
    }

    private async issue(user: UserWithProfile): Promise<SessionGrant> {
        const refreshToken = this.tokens.refresh(user.id);
        await this.repository.saveRefreshToken(user.id, refreshToken, AuthenticationService.refreshExpiry());
        await this.sessions.open(user.profile_tag, user.company_id, user.id, SESSION_TTL_SECONDS);
        return {
            accessToken: this.accessFor(user),
            refreshToken,
            user: {
                id: user.id, name: user.name, email: user.email, profile_tag: user.profile_tag, company_id: user.company_id,
                finance: user.finance, totp_enabled: user.totp_enabled, avatar_url: user.avatar_url, hide_name_active: user.hide_name_active,
            },
        };
    }

    private accessFor(user: UserWithProfile): string {
        return this.tokens.access({
            sub: user.id, email: user.email, company_id: user.company_id, profile_tag: user.profile_tag, finance: user.finance,
        });
    }

    private static refreshExpiry(): Date {
        return new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    }

    private static ticketKey(jti: string) {
        return `totp:used:${jti}`;
    }
}

/** Aprovação de contas — o que o painel do superAdmin precisa (ISP). */
export interface AccountApproval {
    approve(userId: string): Promise<{ id: string; name: string; email: string; is_approved: boolean }>;
}

/** Criação de contas pela chave de administração do sistema e aprovação pelo superAdmin. */
export class AccountService implements AccountApproval {
    constructor(
        private readonly repository: AuthRepository,
        private readonly hasher: PasswordHasher,
    ) {}

    async register(input: RegisterInput) {
        // Trava: nunca criar outro superAdmin (só existe 1 no sistema, criado pelo seed)
        if (input.profile_id === 3) throw new BadRequestError('Não é permitido criar usuários superAdmin');
        if (input.company_id && !(await this.repository.companyExists(input.company_id))) {
            throw new BadRequestError('Empresa não encontrada');
        }
        if (await this.repository.isEmailTaken(input.email)) throw new ConflictError('Email já cadastrado');

        try {
            const user = await this.repository.create({
                name: input.name,
                email: input.email,
                password_hash: await this.hasher.hash(input.password),
                profile_id: input.profile_id,
                company_id: input.company_id ?? null,
            });
            return { id: user.id, name: user.name, email: user.email, profile_id: user.profile_id, company_id: user.company_id, is_approved: user.is_approved };
        } catch (err) {
            if (isUniqueViolation(err)) throw new ConflictError('Email já cadastrado');
            throw err;
        }
    }

    async approve(userId: string) {
        const user = await this.repository.approve(userId);
        if (!user) throw new NotFoundError('Usuário não encontrado');
        return user;
    }
}
