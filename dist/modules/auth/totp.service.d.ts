export interface RecoveryCodeEntry {
    hash: string;
    used_at: string | null;
}
export declare const totpService: {
    /** Gera segredo provisório (Redis, 10 min) e a URI otpauth do QR. Não ativa nada ainda. */
    generateSetup(userId: string, email: string): Promise<{
        otpauth: string;
    } | "redis_unavailable">;
    /** Confirma o código contra o segredo provisório; persiste e devolve os códigos de recuperação (única vez em claro). */
    enable(userId: string, code: string): Promise<string[] | "invalid_code" | "no_setup" | "redis_unavailable">;
    /** Desativa — exige código TOTP válido. */
    disable(userId: string, code: string): Promise<true | "invalid_code" | "not_enabled">;
    /** Passo 2 do login: código TOTP ou código de recuperação (consome o usado). */
    verifyLoginCode(userId: string, code: string): Promise<boolean>;
};
//# sourceMappingURL=totp.service.d.ts.map