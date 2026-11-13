export interface CompanyRecord {
    id: string;
    name: string;
    cnpj_cpf: string | null;
    status: boolean;
    created_at: Date | null;
}

export interface MemberRecord {
    id: string;
    name: string;
    email: string;
    is_approved: boolean;
    company_id: string;
    created_at: Date | null;
    profile_tag: string;
}

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

export type Situacao = 'ATIVA' | 'PENDENTE' | 'INATIVA';

export interface CompanyListItem {
    id: string;
    name: string;
    cnpj_cpf: string | null;
    status: boolean;
    created_at: Date | null;
    users_count: number;
    admin: CompanyAdminInfo | null;
    users: CompanyUserInfo[];
    situacao: Situacao;
}

const isAdmin = (m: MemberRecord) => m.profile_tag === 'admin';
const time = (m: MemberRecord) => new Date(m.created_at ?? 0).getTime();
/** Mais antigo primeiro; empate decidido pelo id para a ordem ser estável. */
const bySeniority = (a: MemberRecord, b: MemberRecord) => (time(a) - time(b)) || a.id.localeCompare(b.id);

/** Como cada empresa aparece no painel do superAdmin (RN-SUP-02, RN-SUP-03). */
export class CompanyPanel {
    static row(company: CompanyRecord, members: MemberRecord[]): CompanyListItem {
        const admin = CompanyPanel.mainAdmin(members);
        return {
            id: company.id,
            name: company.name,
            cnpj_cpf: company.cnpj_cpf,
            status: company.status,
            created_at: company.created_at,
            users_count: members.length,
            admin,
            users: CompanyPanel.team(members),
            situacao: CompanyPanel.situacao(company.status, admin),
        };
    }

    /** INATIVA vence; senão PENDENTE enquanto o admin principal não for aprovado. */
    static situacao(status: boolean, admin: CompanyAdminInfo | null): Situacao {
        if (!status) return 'INATIVA';
        if (admin && !admin.is_approved) return 'PENDENTE';
        return 'ATIVA';
    }

    /** "O admin da empresa" é o usuário de perfil admin mais antigo. */
    private static mainAdmin(members: MemberRecord[]): CompanyAdminInfo | null {
        const [first] = members.filter(isAdmin).sort(bySeniority);
        return first ? { id: first.id, name: first.name, email: first.email, is_approved: first.is_approved } : null;
    }

    /** Equipe completa: admins primeiro, depois por antiguidade. */
    private static team(members: MemberRecord[]): CompanyUserInfo[] {
        return [...members]
            .sort((a, b) => (Number(isAdmin(b)) - Number(isAdmin(a))) || bySeniority(a, b))
            .map((m) => ({ id: m.id, name: m.name, email: m.email, profile_tag: m.profile_tag, is_approved: m.is_approved }));
    }
}
