import { and, eq, sql } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { users, refreshTokens } from './auth.schema';
import { profiles } from '../profiles/profile.db.schema';
import { companies } from '../companies/company.db.schema';
import { userAvatars } from '../meu-perfil/meu-perfil.db.schema';
import { userQueues, userConnections } from '../atendimento/atendimento.db.schema';

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
    assignmentCounts(userId: string): Promise<{ queues: number; connections: number }>;
    create(data: { name: string; email: string; password_hash: string; profile_id: number; company_id: string | null }): Promise<typeof users.$inferSelect>;
    approve(userId: string): Promise<{ id: string; name: string; email: string; is_approved: boolean } | null>;
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

const userWithProfile = {
    id: users.id, name: users.name, email: users.email, password_hash: users.password_hash,
    profile_id: users.profile_id, profile_tag: profiles.tag, company_id: users.company_id,
    email_verified: users.email_verified, is_approved: users.is_approved, finance: users.finance,
    totp_enabled: users.totp_enabled, hide_name_active: users.hide_name_active, avatar_url: userAvatars.url,
};

export class DrizzleAuthRepository implements AuthRepository {
    constructor(private readonly db: DB) {}

    async findByEmailWithProfile(email: string): Promise<UserWithProfile | null> {
        const [row] = await this.db.select(userWithProfile).from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .leftJoin(userAvatars, eq(userAvatars.user_id, users.id))
            .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
        return row ?? null;
    }

    async findByIdWithProfile(id: string): Promise<UserWithProfile | null> {
        const [row] = await this.db.select(userWithProfile).from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .leftJoin(userAvatars, eq(userAvatars.user_id, users.id))
            .where(eq(users.id, id));
        return row ?? null;
    }

    async isEmailTaken(email: string): Promise<boolean> {
        const [row] = await this.db.select({ id: users.id }).from(users)
            .where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
        return !!row;
    }

    async isCompanyActive(companyId: string): Promise<boolean> {
        const [row] = await this.db.select({ status: companies.status }).from(companies).where(eq(companies.id, companyId));
        return !!row?.status;
    }

    async companyExists(companyId: string): Promise<boolean> {
        const [row] = await this.db.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId));
        return !!row;
    }

    async assignmentCounts(userId: string): Promise<{ queues: number; connections: number }> {
        const [[q], [c]] = await Promise.all([
            this.db.select({ n: sql<number>`count(*)::int` }).from(userQueues).where(eq(userQueues.user_id, userId)),
            this.db.select({ n: sql<number>`count(*)::int` }).from(userConnections).where(eq(userConnections.user_id, userId)),
        ]);
        return { queues: q?.n ?? 0, connections: c?.n ?? 0 };
    }

    async create(data: { name: string; email: string; password_hash: string; profile_id: number; company_id: string | null }) {
        const [user] = await this.db.insert(users).values(data).returning();
        return user;
    }

    async approve(userId: string) {
        const [user] = await this.db.update(users)
            .set({ is_approved: true, updated_at: new Date() })
            .where(eq(users.id, userId))
            .returning({ id: users.id, name: users.name, email: users.email, is_approved: users.is_approved });
        return user ?? null;
    }

    async saveRefreshToken(userId: string, token: string, expiresAt: Date): Promise<void> {
        await this.db.insert(refreshTokens).values({ user_id: userId, token, expires_at: expiresAt });
    }

    async hasRefreshToken(token: string): Promise<boolean> {
        const [row] = await this.db.select({ id: refreshTokens.id }).from(refreshTokens).where(eq(refreshTokens.token, token));
        return !!row;
    }

    async deleteRefreshToken(token: string): Promise<void> {
        await this.db.delete(refreshTokens).where(eq(refreshTokens.token, token));
    }

    async totpState(userId: string): Promise<TotpState | null> {
        const [row] = await this.db.select({ totp_secret: users.totp_secret, totp_enabled: users.totp_enabled })
            .from(users).where(eq(users.id, userId));
        return row ?? null;
    }

    async enableTotp(userId: string, secret: string, recovery: RecoveryCodeEntry[]): Promise<void> {
        await this.db.update(users)
            .set({ totp_secret: secret, totp_enabled: true, totp_recovery_codes: recovery, updated_at: new Date() })
            .where(eq(users.id, userId));
    }

    async disableTotp(userId: string): Promise<void> {
        await this.db.update(users)
            .set({ totp_secret: null, totp_enabled: false, totp_recovery_codes: null, updated_at: new Date() })
            .where(eq(users.id, userId));
    }

    consumeRecoveryCode(userId: string, matches: (entry: RecoveryCodeEntry) => Promise<boolean>): Promise<boolean> {
        return this.db.transaction(async (tx) => {
            const [locked] = await tx.select({ codes: users.totp_recovery_codes })
                .from(users).where(and(eq(users.id, userId), eq(users.totp_enabled, true))).for('update');
            const codes = (locked?.codes ?? []) as RecoveryCodeEntry[];
            for (const entry of codes) {
                if (entry.used_at || !(await matches(entry))) continue;
                entry.used_at = new Date().toISOString();
                await tx.update(users).set({ totp_recovery_codes: codes, updated_at: new Date() }).where(eq(users.id, userId));
                return true;
            }
            return false;
        });
    }
}
