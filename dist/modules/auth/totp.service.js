"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.totpService = void 0;
const otplib_1 = require("otplib");
const crypto_1 = require("crypto");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const auth_schema_1 = require("./auth.schema");
const redis_1 = require("../../config/redis");
// Aceita 1 período (30s) de defasagem de relógio entre servidor e celular
// epochTolerance: 30 = +/- 30s (1 step de tolerância)
const TOTP_EPOCH_TOLERANCE = 30;
const SETUP_TTL = 600; // segredo provisório vive 10 min no Redis
/** verifySync lança exceção para tokens fora do formato TOTP (ex.: código de
 *  recuperação XXXX-XXXX) — aqui formato inválido = código não confere. */
function isValidTotp(token, secret) {
    try {
        return (0, otplib_1.verifySync)({ token, secret, epochTolerance: TOTP_EPOCH_TOLERANCE }).valid;
    }
    catch {
        return false;
    }
}
exports.totpService = {
    /** Gera segredo provisório (Redis, 10 min) e a URI otpauth do QR. Não ativa nada ainda. */
    async generateSetup(userId, email) {
        const redis = (0, redis_1.getRedisClient)();
        if (!redis)
            return 'redis_unavailable';
        const secret = (0, otplib_1.generateSecret)();
        await redis.set(`totp:setup:${userId}`, secret, 'EX', SETUP_TTL);
        const otpauth = (0, otplib_1.generateURI)({ issuer: 'Kelmor', label: email, secret });
        return { otpauth };
    },
    /** Confirma o código contra o segredo provisório; persiste e devolve os códigos de recuperação (única vez em claro). */
    async enable(userId, code) {
        const redis = (0, redis_1.getRedisClient)();
        if (!redis)
            return 'redis_unavailable';
        const secret = await redis.get(`totp:setup:${userId}`);
        if (!secret)
            return 'no_setup';
        if (!isValidTotp(code, secret))
            return 'invalid_code';
        const plain = Array.from({ length: 10 }, () => {
            const raw = (0, crypto_1.randomBytes)(4).toString('hex').toUpperCase();
            return `${raw.slice(0, 4)}-${raw.slice(4)}`;
        });
        const recovery = plain.map(c => ({ hash: bcryptjs_1.default.hashSync(c, 10), used_at: null }));
        await client_1.db.update(auth_schema_1.users)
            .set({ totp_secret: secret, totp_enabled: true, totp_recovery_codes: recovery, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
        await redis.del(`totp:setup:${userId}`);
        return plain;
    },
    /** Desativa — exige código TOTP válido. */
    async disable(userId, code) {
        const [u] = await client_1.db.select({ totp_secret: auth_schema_1.users.totp_secret, totp_enabled: auth_schema_1.users.totp_enabled })
            .from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
        if (!u?.totp_enabled || !u.totp_secret)
            return 'not_enabled';
        if (!isValidTotp(code, u.totp_secret))
            return 'invalid_code';
        await client_1.db.update(auth_schema_1.users)
            .set({ totp_secret: null, totp_enabled: false, totp_recovery_codes: null, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
        return true;
    },
    /** Passo 2 do login: código TOTP ou código de recuperação (consome o usado). */
    async verifyLoginCode(userId, code) {
        const [u] = await client_1.db.select({
            totp_secret: auth_schema_1.users.totp_secret,
            totp_enabled: auth_schema_1.users.totp_enabled,
            totp_recovery_codes: auth_schema_1.users.totp_recovery_codes,
        }).from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
        if (!u?.totp_enabled || !u.totp_secret)
            return false;
        if (isValidTotp(code, u.totp_secret))
            return true;
        // Código de recuperação: consumo atômico (FOR UPDATE) — duas requisições
        // concorrentes com o mesmo código não podem ambas consumi-lo.
        return client_1.db.transaction(async (tx) => {
            const [locked] = await tx.select({ totp_recovery_codes: auth_schema_1.users.totp_recovery_codes })
                .from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId)).for('update');
            const codes = (locked?.totp_recovery_codes ?? []);
            const idx = codes.findIndex(c => !c.used_at && bcryptjs_1.default.compareSync(code, c.hash));
            if (idx === -1)
                return false;
            codes[idx].used_at = new Date().toISOString();
            await tx.update(auth_schema_1.users)
                .set({ totp_recovery_codes: codes, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
            return true;
        });
    },
};
//# sourceMappingURL=totp.service.js.map