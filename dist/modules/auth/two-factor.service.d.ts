import type IORedis from 'ioredis';
import { ServiceUnavailableError } from '../../core/errors/http-errors';
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
export declare class RedisEphemeralStore implements EphemeralStore {
    private readonly redis;
    constructor(redis: () => IORedis | null);
    isAvailable(): boolean;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
    delete(key: string): Promise<void>;
    private client;
}
/** Algoritmo de código temporário (TOTP, compatível com Google Authenticator etc.). */
export interface TotpAlgorithm {
    newSecret(): string;
    uri(label: string, secret: string): string;
    isValid(code: string, secret: string): boolean;
}
export declare class OtplibTotp implements TotpAlgorithm {
    private static readonly EPOCH_TOLERANCE;
    newSecret(): string;
    uri(label: string, secret: string): string;
    /** verifySync lança para tokens fora do formato TOTP (ex.: código de recuperação) — aqui isso é "não confere". */
    isValid(code: string, secret: string): boolean;
}
/**
 * Verificação em duas etapas: configurar (QR com segredo provisório por 10
 * min), ativar com um código do app (gera 10 códigos de recuperação de uso
 * único), desativar com um código do app, e conferir o código no login.
 */
export declare class TwoFactorService {
    private readonly repository;
    private readonly store;
    private readonly totp;
    private readonly hasher;
    constructor(repository: AuthRepository, store: EphemeralStore, totp: TotpAlgorithm, hasher: PasswordHasher);
    setup(userId: string, email: string): Promise<{
        otpauth: string;
    }>;
    /** Ativa e devolve os códigos de recuperação — a única vez que eles aparecem em claro. */
    enable(userId: string, code: string): Promise<string[]>;
    disable(userId: string, code: string): Promise<void>;
    /** Passo 2 do login: código do app ou um código de recuperação ainda não usado (que é consumido). */
    verifyLoginCode(userId: string, code: string): Promise<boolean>;
    assertAvailable(): void;
    static unavailable(): ServiceUnavailableError;
    private static setupKey;
}
//# sourceMappingURL=two-factor.service.d.ts.map