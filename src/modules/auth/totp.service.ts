import { generateSecret, generateURI, generateSync, verifySync } from 'otplib';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../../database/client';
import { users } from './auth.schema';
import { getRedisClient } from '../../config/redis';

// Aceita 1 período (30s) de defasagem de relógio entre servidor e celular
// epochTolerance: 30 = +/- 30s (1 step de tolerância)
const TOTP_EPOCH_TOLERANCE = 30;
const SETUP_TTL = 600; // segredo provisório vive 10 min no Redis

export interface RecoveryCodeEntry {
    hash: string;
    used_at: string | null;
}

/** verifySync lança exceção para tokens fora do formato TOTP (ex.: código de
 *  recuperação XXXX-XXXX) — aqui formato inválido = código não confere. */
function isValidTotp(token: string, secret: string): boolean {
    try {
        return verifySync({ token, secret, epochTolerance: TOTP_EPOCH_TOLERANCE }).valid;
    } catch {
        return false;
    }
}

export const totpService = {

    /** Gera segredo provisório (Redis, 10 min) e a URI otpauth do QR. Não ativa nada ainda. */
    async generateSetup(userId: string, email: string): Promise<{ otpauth: string } | 'redis_unavailable'> {
        const redis = getRedisClient();
        if (!redis) return 'redis_unavailable';
        const secret = generateSecret();
        await redis.set(`totp:setup:${userId}`, secret, 'EX', SETUP_TTL);
        const otpauth = generateURI({ issuer: 'Kelmor', label: email, secret });
        return { otpauth };
    },

    /** Confirma o código contra o segredo provisório; persiste e devolve os códigos de recuperação (única vez em claro). */
    async enable(userId: string, code: string): Promise<string[] | 'invalid_code' | 'no_setup' | 'redis_unavailable'> {
        const redis = getRedisClient();
        if (!redis) return 'redis_unavailable';
        const secret = await redis.get(`totp:setup:${userId}`);
        if (!secret) return 'no_setup';
        if (!isValidTotp(code, secret)) return 'invalid_code';

        const plain = Array.from({ length: 10 }, () => {
            const raw = randomBytes(4).toString('hex').toUpperCase();
            return `${raw.slice(0, 4)}-${raw.slice(4)}`;
        });
        const recovery: RecoveryCodeEntry[] = plain.map(c => ({ hash: bcrypt.hashSync(c, 10), used_at: null }));

        await db.update(users)
            .set({ totp_secret: secret, totp_enabled: true, totp_recovery_codes: recovery, updated_at: new Date() })
            .where(eq(users.id, userId));
        await redis.del(`totp:setup:${userId}`);
        return plain;
    },

    /** Desativa — exige código TOTP válido. */
    async disable(userId: string, code: string): Promise<true | 'invalid_code' | 'not_enabled'> {
        const [u] = await db.select({ totp_secret: users.totp_secret, totp_enabled: users.totp_enabled })
            .from(users).where(eq(users.id, userId));
        if (!u?.totp_enabled || !u.totp_secret) return 'not_enabled';
        if (!isValidTotp(code, u.totp_secret)) return 'invalid_code';
        await db.update(users)
            .set({ totp_secret: null, totp_enabled: false, totp_recovery_codes: null, updated_at: new Date() })
            .where(eq(users.id, userId));
        return true;
    },

    /** Passo 2 do login: código TOTP ou código de recuperação (consome o usado). */
    async verifyLoginCode(userId: string, code: string): Promise<boolean> {
        const [u] = await db.select({
            totp_secret: users.totp_secret,
            totp_enabled: users.totp_enabled,
            totp_recovery_codes: users.totp_recovery_codes,
        }).from(users).where(eq(users.id, userId));
        if (!u?.totp_enabled || !u.totp_secret) return false;

        if (isValidTotp(code, u.totp_secret)) return true;

        // Código de recuperação: consumo atômico (FOR UPDATE) — duas requisições
        // concorrentes com o mesmo código não podem ambas consumi-lo.
        return db.transaction(async (tx) => {
            const [locked] = await tx.select({ totp_recovery_codes: users.totp_recovery_codes })
                .from(users).where(eq(users.id, userId)).for('update');
            const codes = (locked?.totp_recovery_codes ?? []) as RecoveryCodeEntry[];
            const idx = codes.findIndex(c => !c.used_at && bcrypt.compareSync(code, c.hash));
            if (idx === -1) return false;
            codes[idx].used_at = new Date().toISOString();
            await tx.update(users)
                .set({ totp_recovery_codes: codes, updated_at: new Date() })
                .where(eq(users.id, userId));
            return true;
        });
    },
};
