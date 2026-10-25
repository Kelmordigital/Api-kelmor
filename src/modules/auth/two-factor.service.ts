import { randomBytes } from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import type IORedis from 'ioredis';
import { BadRequestError, ServiceUnavailableError } from '../../core/errors/http-errors';
import type { PasswordHasher } from '../../core/auth/password-hasher';
import type { AuthRepository } from './auth.repository';

/** Chave-valor temporário (segredo provisório do 2FA, tickets já usados). */
export interface EphemeralStore {
    isAvailable(): boolean;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    /** Grava só se a chave não existir; true se gravou (consumo atômico). */
    setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
    delete(key: string): Promise<void>;
}

export class RedisEphemeralStore implements EphemeralStore {
    constructor(private readonly redis: () => IORedis | null) {}

    isAvailable(): boolean { return !!this.redis(); }
    async get(key: string) { return this.client().get(key); }
    async set(key: string, value: string, ttlSeconds: number) { await this.client().set(key, value, 'EX', ttlSeconds); }
    async setIfAbsent(key: string, value: string, ttlSeconds: number) {
        return (await this.client().set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK';
    }
    async delete(key: string) { await this.client().del(key); }

    private client(): IORedis {
        const redis = this.redis();
        if (!redis) throw TwoFactorService.unavailable();
        return redis;
    }
}

/** Algoritmo de código temporário (TOTP, compatível com Google Authenticator etc.). */
export interface TotpAlgorithm {
    newSecret(): string;
    uri(label: string, secret: string): string;
    isValid(code: string, secret: string): boolean;
}

export class OtplibTotp implements TotpAlgorithm {
    // Aceita 1 período (30s) de defasagem de relógio entre servidor e celular
    private static readonly EPOCH_TOLERANCE = 30;

    newSecret(): string { return generateSecret(); }
    uri(label: string, secret: string): string { return generateURI({ issuer: 'Kelmor', label, secret }); }

    /** verifySync lança para tokens fora do formato TOTP (ex.: código de recuperação) — aqui isso é "não confere". */
    isValid(code: string, secret: string): boolean {
        try {
            return verifySync({ token: code, secret, epochTolerance: OtplibTotp.EPOCH_TOLERANCE }).valid;
        } catch {
            return false;
        }
    }
}

const SETUP_TTL_SECONDS = 600;
const RECOVERY_CODES = 10;

/**
 * Verificação em duas etapas: configurar (QR com segredo provisório por 10
 * min), ativar com um código do app (gera 10 códigos de recuperação de uso
 * único), desativar com um código do app, e conferir o código no login.
 */
export class TwoFactorService {
    constructor(
        private readonly repository: AuthRepository,
        private readonly store: EphemeralStore,
        private readonly totp: TotpAlgorithm,
        private readonly hasher: PasswordHasher,
    ) {}

    async setup(userId: string, email: string): Promise<{ otpauth: string }> {
        this.assertAvailable();
        const secret = this.totp.newSecret();
        await this.store.set(TwoFactorService.setupKey(userId), secret, SETUP_TTL_SECONDS);
        return { otpauth: this.totp.uri(email, secret) };
    }

    /** Ativa e devolve os códigos de recuperação — a única vez que eles aparecem em claro. */
    async enable(userId: string, code: string): Promise<string[]> {
        this.assertAvailable();
        const secret = await this.store.get(TwoFactorService.setupKey(userId));
        if (!secret) throw new BadRequestError('Configuração expirada. Gere um novo QR code.');
        if (!this.totp.isValid(code, secret)) throw new BadRequestError('Código inválido');

        const plain = Array.from({ length: RECOVERY_CODES }, () => {
            const raw = randomBytes(4).toString('hex').toUpperCase();
            return `${raw.slice(0, 4)}-${raw.slice(4)}`;
        });
        const recovery = await Promise.all(plain.map(async (c) => ({ hash: await this.hasher.hash(c), used_at: null })));
        await this.repository.enableTotp(userId, secret, recovery);
        await this.store.delete(TwoFactorService.setupKey(userId));
        return plain;
    }

    async disable(userId: string, code: string): Promise<void> {
        const state = await this.repository.totpState(userId);
        if (!state?.totp_enabled || !state.totp_secret) throw new BadRequestError('Verificação em duas etapas não está ativa.');
        if (!this.totp.isValid(code, state.totp_secret)) throw new BadRequestError('Código inválido');
        await this.repository.disableTotp(userId);
    }

    /** Passo 2 do login: código do app ou um código de recuperação ainda não usado (que é consumido). */
    async verifyLoginCode(userId: string, code: string): Promise<boolean> {
        const state = await this.repository.totpState(userId);
        if (!state?.totp_enabled || !state.totp_secret) return false;
        if (this.totp.isValid(code, state.totp_secret)) return true;
        return this.repository.consumeRecoveryCode(userId, (entry) => this.hasher.verify(code, entry.hash));
    }

    assertAvailable(): void {
        if (!this.store.isAvailable()) throw TwoFactorService.unavailable();
    }

    static unavailable() {
        return new ServiceUnavailableError('Verificação em duas etapas indisponível no momento.');
    }

    private static setupKey(userId: string) {
        return `totp:setup:${userId}`;
    }
}
