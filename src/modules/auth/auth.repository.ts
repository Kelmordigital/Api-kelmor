import { eq } from 'drizzle-orm';
import { db } from '../../database/client';
import { users, refreshTokens } from './auth.schema';

export const authRepository = {
    async findByEmail(email: string) {
        const [user] = await db.select().from(users).where(eq(users.email, email));
        return user ?? null;
    },

    async findById(id: string) {
        const [user] = await db.select().from(users).where(eq(users.id, id));
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
