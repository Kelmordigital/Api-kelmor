export declare const authRepository: {
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
        created_at: Date | null;
        updated_at: Date | null;
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