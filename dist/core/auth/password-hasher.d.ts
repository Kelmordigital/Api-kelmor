/** Gera e confere hashes de senha. Trocar o algoritmo é uma nova implementação. */
export interface PasswordHasher {
    hash(plain: string): Promise<string>;
    verify(plain: string, hash: string): Promise<boolean>;
}
export declare class BcryptPasswordHasher implements PasswordHasher {
    private readonly rounds;
    constructor(rounds?: number);
    hash(plain: string): Promise<string>;
    verify(plain: string, hash: string): Promise<boolean>;
}
//# sourceMappingURL=password-hasher.d.ts.map