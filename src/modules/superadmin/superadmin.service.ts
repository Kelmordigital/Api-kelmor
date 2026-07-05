import { eq, desc, isNotNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../../database/client';
import { companies, Company } from '../companies/company.db.schema';
import { users } from '../auth/auth.schema';
import { profiles } from '../profiles/profile.db.schema';

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

/** Situação exibida no painel: INATIVA vence; senão PENDENTE se o admin não foi aprovado. */
function deriveSituacao(status: boolean, admin: CompanyAdminInfo | null): CompanyListItem['situacao'] {
    if (!status) return 'INATIVA';
    if (admin && !admin.is_approved) return 'PENDENTE';
    return 'ATIVA';
}

export const superadminService = {

    async stats(): Promise<{ total: number; ativas: number; inativas: number; pendentes: number }> {
        const cos = await db.select({ status: companies.status }).from(companies);
        // pendentes = usuários de perfil admin com is_approved=false (spec)
        const admins = await db
            .select({ is_approved: users.is_approved })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .where(eq(profiles.tag, 'admin'));
        const pendentes = admins.filter(a => !a.is_approved).length;
        const ativas = cos.filter(c => c.status).length;
        return { total: cos.length, ativas, inativas: cos.length - ativas, pendentes };
    },

    async listCompanies(): Promise<CompanyListItem[]> {
        const cos: Company[] = await db.select().from(companies).orderBy(desc(companies.created_at));

        const allUsers = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                is_approved: users.is_approved,
                company_id: users.company_id,
                created_at: users.created_at,
                profile_tag: profiles.tag,
            })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .where(isNotNull(users.company_id));

        return cos.map(co => {
            const companyUsers = allUsers.filter(u => u.company_id === co.id);
            // "o admin da empresa" = usuário de perfil admin mais antigo (spec)
            const admins = companyUsers
                .filter(u => u.profile_tag === 'admin')
                .sort((a, b) =>
                    (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
                    || a.id.localeCompare(b.id));
            const admin: CompanyAdminInfo | null = admins[0]
                ? { id: admins[0].id, name: admins[0].name, email: admins[0].email, is_approved: admins[0].is_approved }
                : null;
            // Equipe completa: admins primeiro, depois por antiguidade (mesmo tie-break por id)
            const team: CompanyUserInfo[] = [...companyUsers]
                .sort((a, b) =>
                    (Number(b.profile_tag === 'admin') - Number(a.profile_tag === 'admin'))
                    || (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
                    || a.id.localeCompare(b.id))
                .map(u => ({ id: u.id, name: u.name, email: u.email, profile_tag: u.profile_tag, is_approved: u.is_approved }));
            return {
                id: co.id,
                name: co.name,
                cnpj_cpf: co.cnpj_cpf ?? null,
                status: co.status,
                created_at: co.created_at ?? null,
                users_count: companyUsers.length,
                admin,
                users: team,
                situacao: deriveSituacao(co.status, admin),
            };
        });
    },

    /** Cria empresa ativa + usuário admin bloqueado (is_approved=false), em transação. */
    async createCompany(payload: {
        name: string;
        cnpj_cpf?: string | null;
        admin: { name: string; email: string; password: string };
    }): Promise<{ company: Company; admin: typeof users.$inferSelect } | 'email_conflict'> {
        const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, payload.admin.email));
        if (existing) return 'email_conflict';

        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
        const password_hash = await bcrypt.hash(payload.admin.password, 10);

        return db.transaction(async (tx) => {
            const [company] = await tx.insert(companies)
                .values({ name: payload.name, cnpj_cpf: payload.cnpj_cpf ?? null, status: true })
                .returning();
            const [admin] = await tx.insert(users).values({
                name: payload.admin.name,
                email: payload.admin.email,
                password_hash,
                profile_id: adminProfile.id,
                company_id: company.id,
                email_verified: true,
                is_approved: false, // nasce bloqueado — aprovação manual do superAdmin
                finance: true,      // dono da empresa, mesmo padrão do seed
            }).returning();
            return { company, admin };
        });
    },

    async updateCompany(id: string, data: { name?: string; cnpj_cpf?: string | null }): Promise<Company | null> {
        const [company] = await db.update(companies)
            .set({ ...data, updated_at: new Date() })
            .where(eq(companies.id, id))
            .returning();
        return company ?? null;
    },

    async setCompanyStatus(id: string, status: boolean): Promise<Company | null> {
        const [company] = await db.update(companies)
            .set({ status, updated_at: new Date() })
            .where(eq(companies.id, id))
            .returning();
        return company ?? null;
    },

    /** Revoga a aprovação de login (is_approved=false). */
    async revokeUser(userId: string) {
        const [user] = await db.update(users)
            .set({ is_approved: false, updated_at: new Date() })
            .where(eq(users.id, userId))
            .returning({ id: users.id, name: users.name, email: users.email, is_approved: users.is_approved });
        return user ?? null;
    },
};
