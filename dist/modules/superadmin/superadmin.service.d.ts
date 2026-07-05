import { Company } from '../companies/company.db.schema';
import { users } from '../auth/auth.schema';
export interface CompanyAdminInfo {
    id: string;
    name: string;
    email: string;
    is_approved: boolean;
}
export interface CompanyUserInfo {
    id: string;
    name: string;
    email: string;
    profile_tag: string;
    is_approved: boolean;
}
export interface CompanyListItem {
    id: string;
    name: string;
    cnpj_cpf: string | null;
    status: boolean;
    created_at: Date | null;
    users_count: number;
    admin: CompanyAdminInfo | null;
    users: CompanyUserInfo[];
    situacao: 'ATIVA' | 'PENDENTE' | 'INATIVA';
}
export declare const superadminService: {
    stats(): Promise<{
        total: number;
        ativas: number;
        inativas: number;
        pendentes: number;
    }>;
    listCompanies(): Promise<CompanyListItem[]>;
    /** Cria empresa ativa + usuário admin bloqueado (is_approved=false), em transação. */
    createCompany(payload: {
        name: string;
        cnpj_cpf?: string | null;
        admin: {
            name: string;
            email: string;
            password: string;
        };
    }): Promise<{
        company: Company;
        admin: typeof users.$inferSelect;
    } | "email_conflict">;
    updateCompany(id: string, data: {
        name?: string;
        cnpj_cpf?: string | null;
    }): Promise<Company | null>;
    setCompanyStatus(id: string, status: boolean): Promise<Company | null>;
    /** Revoga a aprovação de login (is_approved=false). */
    revokeUser(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        is_approved: boolean;
    }>;
};
//# sourceMappingURL=superadmin.service.d.ts.map