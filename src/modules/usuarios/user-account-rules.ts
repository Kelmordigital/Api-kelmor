import { BadRequestError } from '../../core/errors/http-errors';

export const PASSWORD_MIN_LENGTH = 8;
const NAME_MAX = 200;
const EMAIL_MAX = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Regras de dados de uma conta de usuário, sem banco. */
export class UserAccountRules {
    /** Criação: nome, e-mail e senha obrigatórios; devolve os valores normalizados. */
    static forCreation(input: { name?: string; email?: string; password?: string }) {
        const name = input.name?.trim();
        const email = input.email?.trim();
        const password = input.password?.trim();
        if (!name || !email || !password) throw new BadRequestError('Nome, e-mail e senha são obrigatórios');
        return { name: this.name(name), email: this.email(email), password: this.password(password) };
    }

    /** Edição: só o que veio; senha em branco significa "não trocar". */
    static forUpdate(input: { name?: string; email?: string; password?: string }) {
        const changes: { name?: string; email?: string; password?: string } = {};
        if (input.name !== undefined) {
            if (!input.name.trim()) throw new BadRequestError('Nome e e-mail são obrigatórios');
            changes.name = this.name(input.name.trim());
        }
        if (input.email !== undefined) {
            if (!input.email.trim()) throw new BadRequestError('Nome e e-mail são obrigatórios');
            changes.email = this.email(input.email.trim());
        }
        if (input.password?.trim()) changes.password = this.password(input.password.trim());
        return changes;
    }

    private static name(name: string): string {
        if (name.length > NAME_MAX) throw new BadRequestError(`O nome deve ter no máximo ${NAME_MAX} caracteres`);
        return name;
    }

    /** E-mails são únicos no sistema inteiro e guardados em minúsculas. */
    private static email(email: string): string {
        const normalized = email.toLowerCase();
        if (normalized.length > EMAIL_MAX || !EMAIL_PATTERN.test(normalized)) throw new BadRequestError('E-mail inválido');
        return normalized;
    }

    private static password(password: string): string {
        if (password.length < PASSWORD_MIN_LENGTH) {
            throw new BadRequestError(`A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres`);
        }
        return password;
    }
}
