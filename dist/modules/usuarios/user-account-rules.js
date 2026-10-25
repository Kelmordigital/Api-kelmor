"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserAccountRules = exports.PASSWORD_MIN_LENGTH = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
exports.PASSWORD_MIN_LENGTH = 8;
const NAME_MAX = 200;
const EMAIL_MAX = 200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Regras de dados de uma conta de usuário, sem banco. */
class UserAccountRules {
    /** Criação: nome, e-mail e senha obrigatórios; devolve os valores normalizados. */
    static forCreation(input) {
        const name = input.name?.trim();
        const email = input.email?.trim();
        const password = input.password?.trim();
        if (!name || !email || !password)
            throw new http_errors_1.BadRequestError('Nome, e-mail e senha são obrigatórios');
        return { name: this.name(name), email: this.email(email), password: this.password(password) };
    }
    /** Edição: só o que veio; senha em branco significa "não trocar". */
    static forUpdate(input) {
        const changes = {};
        if (input.name !== undefined) {
            if (!input.name.trim())
                throw new http_errors_1.BadRequestError('Nome e e-mail são obrigatórios');
            changes.name = this.name(input.name.trim());
        }
        if (input.email !== undefined) {
            if (!input.email.trim())
                throw new http_errors_1.BadRequestError('Nome e e-mail são obrigatórios');
            changes.email = this.email(input.email.trim());
        }
        if (input.password?.trim())
            changes.password = this.password(input.password.trim());
        return changes;
    }
    static name(name) {
        if (name.length > NAME_MAX)
            throw new http_errors_1.BadRequestError(`O nome deve ter no máximo ${NAME_MAX} caracteres`);
        return name;
    }
    /** E-mails são únicos no sistema inteiro e guardados em minúsculas. */
    static email(email) {
        const normalized = email.toLowerCase();
        if (normalized.length > EMAIL_MAX || !EMAIL_PATTERN.test(normalized))
            throw new http_errors_1.BadRequestError('E-mail inválido');
        return normalized;
    }
    static password(password) {
        if (password.length < exports.PASSWORD_MIN_LENGTH) {
            throw new http_errors_1.BadRequestError(`A senha deve ter no mínimo ${exports.PASSWORD_MIN_LENGTH} caracteres`);
        }
        return password;
    }
}
exports.UserAccountRules = UserAccountRules;
//# sourceMappingURL=user-account-rules.js.map