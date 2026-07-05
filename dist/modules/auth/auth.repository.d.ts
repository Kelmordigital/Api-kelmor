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
};
export declare const authRepository: {
    findByEmailWithProfile(email: string): Promise<UserWithProfile | null>;
    findByEmail(email: string): Promise<{
        id: string;
        name: string;
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
        created_at: Date | null;
        updated_at: Date | null;
    }>;
    findById(id: string): Promise<{
        id: string;
        name: string;
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
        created_at: Date | null;
        updated_at: Date | null;
    }>;
    findByIdWithProfile(id: string): Promise<UserWithProfile | null>;
    findCompanyById(companyId: string): Promise<{
        id: string;
        status: boolean;
    }>;
    create(data: {
        name: string;
        email: string;
        password_hash: string;
        profile_id: number;
        company_id?: string | null;
    }): Promise<{
        id: string;
        name: string;
        created_at: Date | null;
        updated_at: Date | null;
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
    }>;
    approveUser(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        is_approved: boolean;
    }>;
    saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void>;
    findRefreshToken(token: string): Promise<{
        id: string;
        user_id: string;
        token: string;
        expires_at: Date;
        created_at: Date | null;
    }>;
    deleteRefreshToken(token: string): Promise<void>;
    deleteAllRefreshTokens(userId: string): Promise<void>;
};
//# sourceMappingURL=auth.repository.d.ts.map