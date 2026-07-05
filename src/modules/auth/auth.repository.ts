import { eq } from 'drizzle-orm';
import { db } from '../../database/client';
import { users, refreshTokens } from './auth.schema';
import { profiles } from '../profiles/profile.db.schema';
import { companies } from '../companies/company.db.schema';

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

export const authRepository = {
    async findByEmailWithProfile(email: string): Promise<UserWithProfile | null> {
        const [result] = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                password_hash: users.password_hash,
                profile_id: users.profile_id,
                profile_tag: profiles.tag,
                company_id: users.company_id,
                email_verified: users.email_verified,
                is_approved: users.is_approved,
                finance: users.finance,
                totp_enabled: users.totp_enabled,
            })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .where(eq(users.email, email));
        return result ?? null;
    },

    async findByEmail(email: string) {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        return user ?? null;
    },

    async findById(id: string) {
        const [user] = await db.select().from(users).where(eq(users.id, id));
        return user ?? null;
    },

    async findByIdWithProfile(id: string): Promise<UserWithProfile | null> {
        const [result] = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                password_hash: users.password_hash,
                profile_id: users.profile_id,
                profile_tag: profiles.tag,
                company_id: users.company_id,
                email_verified: users.email_verified,
                is_approved: users.is_approved,
                finance: users.finance,
                totp_enabled: users.totp_enabled,
            })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .where(eq(users.id, id));
        return result ?? null;
    },

    async findCompanyById(companyId: string) {
        const [company] = await db
            .select({ id: companies.id, status: companies.status })
            .from(companies)
            .where(eq(companies.id, companyId));
        return company ?? null;
    },

    async create(data: {
        name: string;
        email: string;
        password_hash: string;
        profile_id: number;
        company_id?: string | null;
    }) {
        const [user] = await db.insert(users).values(data).returning();
        return user;
    },

    async approveUser(userId: string) {
        const [user] = await db
            .update(users)
            .set({ is_approved: true, updated_at: new Date() })
            .where(eq(users.id, userId))
            .returning({
                id: users.id,
                name: users.name,
                email: users.email,
                is_approved: users.is_approved,
            });
        return user ?? null;
    },

    async saveRefreshToken(userId: string, token: string, expiresAt: Date) {
        await db.insert(refreshTokens).values({ user_id: userId, token, expires_at: expiresAt });
    },

    async findRefreshToken(token: string) {
        const [t] = await db.select().from(refreshTokens).where(eq(refreshTokens.token, token));
        return t ?? null;
    },

    async deleteRefreshToken(token: string) {
        await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
    },

    async deleteAllRefreshTokens(userId: string) {
        await db.delete(refreshTokens).where(eq(refreshTokens.user_id, userId));
    },
};
