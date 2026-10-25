import type { PasswordHasher } from '../../core/auth/password-hasher';
import type { SessionStore } from '../../core/auth/session';
import type { AuthRepository } from './auth.repository';
import type { TokenService } from './auth.tokens';
import type { EphemeralStore, TwoFactorService } from './two-factor.service';
import type { RegisterInput } from './auth.dto';
export declare const SESSION_TTL_SECONDS: number;
/** Sessão emitida: o access token vai no corpo, o refresh token num cookie httpOnly. */
export interface SessionGrant {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        name: string;
        email: string;
        profile_tag: string;
        company_id: string | null;
        finance: boolean;
        totp_enabled: boolean;
        avatar_url: string | null;
        hide_name_active: boolean;
    };
}
export type LoginResult = {
    kind: 'session';
    grant: SessionGrant;
} | {
    kind: 'totp_required';
    ticket: string;
};
/**
 * Entrar, renovar e sair. Uma sessão só nasce (ou se renova) para conta
 * liberada pela AccountStatusPolicy; com 2FA ativo, a senha sozinha não basta.
 */
export declare class AuthenticationService {
    private readonly repository;
    private readonly hasher;
    private readonly tokens;
    private readonly sessions;
    private readonly twoFactor;
    private readonly usedTickets;
    /** Hash qualquer, para o "usuário não existe" levar o mesmo tempo que "senha errada". */
    private readonly decoyHash;
    constructor(repository: AuthRepository, hasher: PasswordHasher, tokens: TokenService, sessions: SessionStore, twoFactor: TwoFactorService, usedTickets: EphemeralStore);
    login(email: string, password: string): Promise<LoginResult>;
    /** Passo 2 do login com 2FA: o ticket vale uma única vez. */
    completeTotpLogin(ticket: string, code: string): Promise<SessionGrant>;
    /** Troca o refresh token por um novo (rotação) e devolve um access token novo. */
    refresh(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    /** Apaga o refresh token e encerra a sessão: o access token em uso deixa de valer na hora. */
    logout(refreshToken: string): Promise<void>;
    me(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        profile_id: number;
        profile_tag: string;
        company_id: string | null;
        email_verified: boolean;
        is_approved: boolean;
        finance: boolean;
        totp_enabled: boolean;
        avatar_url: string | null;
        hide_name_active: boolean;
        queue_count: number;
        connection_count: number;
    }>;
    private issue;
    private accessFor;
    private static refreshExpiry;
    private static ticketKey;
}
/** Aprovação de contas — o que o painel do superAdmin precisa (ISP). */
export interface AccountApproval {
    approve(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        is_approved: boolean;
    }>;
}
/** Criação de contas pela chave de administração do sistema e aprovação pelo superAdmin. */
export declare class AccountService implements AccountApproval {
    private readonly repository;
    private readonly hasher;
    constructor(repository: AuthRepository, hasher: PasswordHasher);
    register(input: RegisterInput): Promise<{
        id: string;
        name: string;
        email: string;
        profile_id: number;
        company_id: string | null;
        is_approved: boolean;
    }>;
    approve(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        is_approved: boolean;
    }>;
}
//# sourceMappingURL=auth.service.d.ts.map