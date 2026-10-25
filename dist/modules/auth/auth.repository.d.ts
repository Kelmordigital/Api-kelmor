import type { DB } from '../../database/client';
import { users } from './auth.schema';
export type UserWithProfile = {
    id: string;
    name: string;
    email: string;
    password_hash: string;
    profile_id: number;
    profile_tag: string;
    company_id: string | null;
    email_verified: boolean;
    is_approved: boolean;
    finance: boolean;
    totp_enabled: boolean;
    avatar_url: string | null;
    hide_name_active: boolean;
};
export interface TotpState {
    totp_secret: string | null;
    totp_enabled: boolean;
}
export interface RecoveryCodeEntry {
    hash: string;
    used_at: string | null;
}
export interface AuthRepository {
    /** Busca pelo e-mail sem diferenciar maiúsculas. */
    findByEmailWithProfile(email: string): Promise<UserWithProfile | null>;
    findByIdWithProfile(id: string): Promise<UserWithProfile | null>;
    isEmailTaken(email: string): Promise<boolean>;
    isCompanyActive(companyId: string): Promise<boolean>;
    companyExists(companyId: string): Promise<boolean>;
    assignmentCounts(userId: string): Promise<{
        queues: number;
        connections: number;
    }>;
    create(data: {
        name: string;
        email: string;
        password_hash: string;
        profile_id: number;
        company_id: string | null;
    }): Promise<typeof users.$inferSelect>;
    approve(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        is_approved: boolean;
    } | null>;
    saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void>;
    hasRefreshToken(token: string): Promise<boolean>;
    deleteRefreshToken(token: string): Promise<void>;
    totpState(userId: string): Promise<TotpState | null>;
    enableTotp(userId: string, secret: string, recovery: RecoveryCodeEntry[]): Promise<void>;
    disableTotp(userId: string): Promise<void>;
    /**
     * Consome um código de recuperação numa transação com trava da linha —
     * duas tentativas simultâneas com o mesmo código não passam as duas.
     */
    consumeRecoveryCode(userId: string, matches: (entry: RecoveryCodeEntry) => Promise<boolean>): Promise<boolean>;
}
export declare class DrizzleAuthRepository implements AuthRepository {
    private readonly db;
    constructor(db: DB);
    findByEmailWithProfile(email: string): Promise<UserWithProfile | null>;
    findByIdWithProfile(id: string): Promise<UserWithProfile | null>;
    isEmailTaken(email: string): Promise<boolean>;
    isCompanyActive(companyId: string): Promise<boolean>;
    companyExists(companyId: string): Promise<boolean>;
    assignmentCounts(userId: string): Promise<{
        queues: number;
        connections: number;
    }>;
    create(data: {
        name: string;
        email: string;
        password_hash: string;
        profile_id: number;
        company_id: string | null;
    }): Promise<{
        id: string;
        name: string;
        created_at: Date | null;
        updated_at: Date | null;
        nickname: string | null;
        email: string;
        password_hash: string;
        profile_id: number;
        company_id: string | null;
        email_verified: boolean;
        is_approved: boolean;
        finance: boolean;
        totp_secret: string | null;
        totp_enabled: boolean;
        totp_recovery_codes: unknown;
        xp: number;
        hide_name_active: boolean;
    }>;
    approve(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        is_approved: boolean;
    }>;
    saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void>;
    hasRefreshToken(token: string): Promise<boolean>;
    deleteRefreshToken(token: string): Promise<void>;
    totpState(userId: string): Promise<TotpState | null>;
    enableTotp(userId: string, secret: string, recovery: RecoveryCodeEntry[]): Promise<void>;
    disableTotp(userId: string): Promise<void>;
    consumeRecoveryCode(userId: string, matches: (entry: RecoveryCodeEntry) => Promise<boolean>): Promise<boolean>;
}
//# sourceMappingURL=auth.repository.d.ts.map