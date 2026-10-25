"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoFactorService = exports.OtplibTotp = exports.RedisEphemeralStore = void 0;
const crypto_1 = require("crypto");
const otplib_1 = require("otplib");
const http_errors_1 = require("../../core/errors/http-errors");
class RedisEphemeralStore {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    isAvailable() { return !!this.redis(); }
    async get(key) { return this.client().get(key); }
    async set(key, value, ttlSeconds) { await this.client().set(key, value, 'EX', ttlSeconds); }
    async setIfAbsent(key, value, ttlSeconds) {
        return (await this.client().set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
    }
    async delete(key) { await this.client().del(key); }
    client() {
        const redis = this.redis();
        if (!redis)
            throw TwoFactorService.unavailable();
        return redis;
    }
}
exports.RedisEphemeralStore = RedisEphemeralStore;
class OtplibTotp {
    // Aceita 1 período (30s) de defasagem de relógio entre servidor e celular
    static EPOCH_TOLERANCE = 30;
    newSecret() { return (0, otplib_1.generateSecret)(); }
    uri(label, secret) { return (0, otplib_1.generateURI)({ issuer: 'Kelmor', label, secret }); }
    /** verifySync lança para tokens fora do formato TOTP (ex.: código de recuperação) — aqui isso é "não confere". */
    isValid(code, secret) {
        try {
            return (0, otplib_1.verifySync)({ token: code, secret, epochTolerance: OtplibTotp.EPOCH_TOLERANCE }).valid;
        }
        catch {
            return false;
        }
    }
}
exports.OtplibTotp = OtplibTotp;
const SETUP_TTL_SECONDS = 600;
const RECOVERY_CODES = 10;
/**
 * Verificação em duas etapas: configurar (QR com segredo provisório por 10
 * min), ativar com um código do app (gera 10 códigos de recuperação de uso
 * único), desativar com um código do app, e conferir o código no login.
 */
class TwoFactorService {
    repository;
    store;
    totp;
    hasher;
    constructor(repository, store, totp, hasher) {
        this.repository = repository;
        this.store = store;
        this.totp = totp;
        this.hasher = hasher;
    }
    async setup(userId, email) {
        this.assertAvailable();
        const secret = this.totp.newSecret();
        await this.store.set(TwoFactorService.setupKey(userId), secret, SETUP_TTL_SECONDS);
        return { otpauth: this.totp.uri(email, secret) };
    }
    /** Ativa e devolve os códigos de recuperação — a única vez que eles aparecem em claro. */
    async enable(userId, code) {
        this.assertAvailable();
        const secret = await this.store.get(TwoFactorService.setupKey(userId));
        if (!secret)
            throw new http_errors_1.BadRequestError('Configuração expirada. Gere um novo QR code.');
        if (!this.totp.isValid(code, secret))
            throw new http_errors_1.BadRequestError('Código inválido');
        const plain = Array.from({ length: RECOVERY_CODES }, () => {
            const raw = (0, crypto_1.randomBytes)(4).toString('hex').toUpperCase();
            return `${raw.slice(0, 4)}-${raw.slice(4)}`;
        });
        const recovery = await Promise.all(plain.map(async (c) => ({ hash: await this.hasher.hash(c), used_at: null })));
        await this.repository.enableTotp(userId, secret, recovery);
        await this.store.delete(TwoFactorService.setupKey(userId));
        return plain;
    }
    async disable(userId, code) {
        const state = await this.repository.totpState(userId);
        if (!state?.totp_enabled || !state.totp_secret)
            throw new http_errors_1.BadRequestError('Verificação em duas etapas não está ativa.');
        if (!this.totp.isValid(code, state.totp_secret))
            throw new http_errors_1.BadRequestError('Código inválido');
        await this.repository.disableTotp(userId);
    }
    /** Passo 2 do login: código do app ou um código de recuperação ainda não usado (que é consumido). */
    async verifyLoginCode(userId, code) {
        const state = await this.repository.totpState(userId);
        if (!state?.totp_enabled || !state.totp_secret)
            return false;
        if (this.totp.isValid(code, state.totp_secret))
            return true;
        return this.repository.consumeRecoveryCode(userId, (entry) => this.hasher.verify(code, entry.hash));
    }
    assertAvailable() {
        if (!this.store.isAvailable())
            throw TwoFactorService.unavailable();
    }
    static unavailable() {
        return new http_errors_1.ServiceUnavailableError('Verificação em duas etapas indisponível no momento.');
    }
    static setupKey(userId) {
        return `totp:setup:${userId}`;
    }
}
exports.TwoFactorService = TwoFactorService;
//# sourceMappingURL=two-factor.service.js.map