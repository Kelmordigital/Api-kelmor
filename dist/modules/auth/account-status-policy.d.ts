/** Por que uma conta não pode ter sessão agora (null = liberada). */
export type AccountBlock = 'email_not_verified' | 'not_approved' | 'no_company' | 'company_inactive';
export interface AccountState {
    email_verified: boolean;
    is_approved: boolean;
    profile_tag: string;
    company_id: string | null;
}
/**
 * Regras para ter sessão, na ordem em que são conferidas: e-mail verificado,
 * conta aprovada e — exceto para o superAdmin — empresa vinculada e ativa.
 * Valem no login e em cada renovação de sessão.
 */
export declare class AccountStatusPolicy {
    static blockOf(account: AccountState, companyIsActive: () => Promise<boolean>): Promise<AccountBlock | null>;
}
/** Mensagem do login para cada bloqueio. */
export declare const LOGIN_BLOCK_MESSAGES: Record<AccountBlock, string>;
//# sourceMappingURL=account-status-policy.d.ts.map