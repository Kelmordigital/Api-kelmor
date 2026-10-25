export declare const PASSWORD_MIN_LENGTH = 8;
/** Regras de dados de uma conta de usuário, sem banco. */
export declare class UserAccountRules {
    /** Criação: nome, e-mail e senha obrigatórios; devolve os valores normalizados. */
    static forCreation(input: {
        name?: string;
        email?: string;
        password?: string;
    }): {
        name: string;
        email: string;
        password: string;
    };
    /** Edição: só o que veio; senha em branco significa "não trocar". */
    static forUpdate(input: {
        name?: string;
        email?: string;
        password?: string;
    }): {
        name?: string;
        email?: string;
        password?: string;
    };
    private static name;
    /** E-mails são únicos no sistema inteiro e guardados em minúsculas. */
    private static email;
    private static password;
}
//# sourceMappingURL=user-account-rules.d.ts.map