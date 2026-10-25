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
export class AccountStatusPolicy {
    static async blockOf(account: AccountState, companyIsActive: () => Promise<boolean>): Promise<AccountBlock | null> {
        if (!account.email_verified) return 'email_not_verified';
        if (!account.is_approved) return 'not_approved';
        if (account.profile_tag === 'superAdmin') return null;
        if (!account.company_id) return 'no_company';
        if (!(await companyIsActive())) return 'company_inactive';
        return null;
    }
}

/** Mensagem do login para cada bloqueio. */
export const LOGIN_BLOCK_MESSAGES: Record<AccountBlock, string> = {
    email_not_verified: 'Email não verificado',
    not_approved: 'Sua conta está aguardando aprovação.',
    no_company: 'Sua conta está indisponível no momento. Entre em contato com o financeiro.',
    company_inactive: 'Empresa inativa',
};
