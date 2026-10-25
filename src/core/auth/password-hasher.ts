import bcrypt from 'bcryptjs';

/** Gera e confere hashes de senha. Trocar o algoritmo é uma nova implementação. */
export interface PasswordHasher {
    hash(plain: string): Promise<string>;
    verify(plain: string, hash: string): Promise<boolean>;
}

export class BcryptPasswordHasher implements PasswordHasher {
    constructor(private readonly rounds = 10) {}

    hash(plain: string): Promise<string> {
        return bcrypt.hash(plain, this.rounds);
    }

    verify(plain: string, hash: string): Promise<boolean> {
        return bcrypt.compare(plain, hash);
    }
}
