"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOGIN_BLOCK_MESSAGES = exports.AccountStatusPolicy = void 0;
/**
 * Regras para ter sessão, na ordem em que são conferidas: e-mail verificado,
 * conta aprovada e — exceto para o superAdmin — empresa vinculada e ativa.
 * Valem no login e em cada renovação de sessão.
 */
class AccountStatusPolicy {
    static async blockOf(account, companyIsActive) {
        if (!account.email_verified)
            return 'email_not_verified';
        if (!account.is_approved)
            return 'not_approved';
        if (account.profile_tag === 'superAdmin')
            return null;
        if (!account.company_id)
            return 'no_company';
        if (!(await companyIsActive()))
            return 'company_inactive';
        return null;
    }
}
exports.AccountStatusPolicy = AccountStatusPolicy;
/** Mensagem do login para cada bloqueio. */
exports.LOGIN_BLOCK_MESSAGES = {
    email_not_verified: 'Email não verificado',
    not_approved: 'Sua conta está aguardando aprovação.',
    no_company: 'Sua conta está indisponível no momento. Entre em contato com o financeiro.',
    company_inactive: 'Empresa inativa',
};
//# sourceMappingURL=account-status-policy.js.map