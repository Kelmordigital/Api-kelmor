import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { db as Database } from '../../database/client';
import { companies, type Company } from '../companies/company.db.schema';
import { users } from '../auth/auth.schema';
import { profiles } from '../profiles/profile.db.schema';
import type { CompanyRecord, MemberRecord } from './company-panel';

export type CompanyAdminRow = typeof users.$inferSelect;

export interface NewCompany {
    name: string;
    cnpj_cpf: string | null;
}

export interface NewCompanyAdmin {
    name: string;
    email: string;
    password_hash: string;
}

export interface RevokedUser {
    id: string;
    name: string;
    email: string;
    is_approved: boolean;
    company_id: string | null;
}

export interface SuperadminRepository {
    companyStatuses(): Promise<boolean[]>;
    countPendingAdmins(): Promise<number>;
    listCompanies(): Promise<CompanyRecord[]>;
    listMembers(): Promise<MemberRecord[]>;
    isEmailTaken(email: string): Promise<boolean>;
    /** Empresa e admin juntos: ou os dois existem, ou nenhum. */
    createCompanyWithAdmin(company: NewCompany, admin: NewCompanyAdmin): Promise<{ company: Company; admin: CompanyAdminRow }>;
    updateCompany(id: string, data: Partial<NewCompany>): Promise<Company | null>;
    setCompanyStatus(id: string, status: boolean): Promise<Company | null>;
    memberIds(companyId: string): Promise<string[]>;
    revokeApproval(userId: string): Promise<RevokedUser | null>;
}

export class DrizzleSuperadminRepository implements SuperadminRepository {
    constructor(private readonly db: typeof Database) {}

    async companyStatuses() {
        const rows = await this.db.select({ status: companies.status }).from(companies);
        return rows.map((r) => r.status);
    }

    async countPendingAdmins() {
        const [row] = await this.db
            .select({ total: sql<number>`count(*)::int` })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .where(and(eq(profiles.tag, 'admin'), eq(users.is_approved, false)));
        return row?.total ?? 0;
    }

    listCompanies(): Promise<CompanyRecord[]> {
        return this.db
            .select({
                id: companies.id, name: companies.name, cnpj_cpf: companies.cnpj_cpf,
                status: companies.status, created_at: companies.created_at,
            })
            .from(companies)
            .orderBy(desc(companies.created_at));
    }

    async listMembers(): Promise<MemberRecord[]> {
        const rows = await this.db
            .select({
                id: users.id, name: users.name, email: users.email, is_approved: users.is_approved,
                company_id: users.company_id, created_at: users.created_at, profile_tag: profiles.tag,
            })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .where(isNotNull(users.company_id));
        return rows.map((r) => ({ ...r, company_id: r.company_id! }));
    }

    async isEmailTaken(email: string) {
        const [row] = await this.db.select({ id: users.id }).from(users)
            .where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1);
        return Boolean(row);
    }

    createCompanyWithAdmin(company: NewCompany, admin: NewCompanyAdmin) {
        return this.db.transaction(async (tx) => {
            const [adminProfile] = await tx.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
            const [created] = await tx.insert(companies).values({ ...company, status: true }).returning();
            const [createdAdmin] = await tx.insert(users).values({
                ...admin,
                profile_id: adminProfile.id,
                company_id: created.id,
                email_verified: true,
                is_approved: false, // nasce bloqueado — aprovação manual do superAdmin
                finance: true,      // dono da empresa, mesmo padrão do seed
            }).returning();
            return { company: created, admin: createdAdmin };
        });
    }

    async updateCompany(id: string, data: Partial<NewCompany>) {
        const [company] = await this.db.update(companies)
            .set({ ...data, updated_at: new Date() })
            .where(eq(companies.id, id))
            .returning();
        return company ?? null;
    }

    async setCompanyStatus(id: string, status: boolean) {
        const [company] = await this.db.update(companies)
            .set({ status, updated_at: new Date() })
            .where(eq(companies.id, id))
            .returning();
        return company ?? null;
    }

    async memberIds(companyId: string) {
        const rows = await this.db.select({ id: users.id }).from(users).where(eq(users.company_id, companyId));
        return rows.map((r) => r.id);
    }

    async revokeApproval(userId: string) {
        const [user] = await this.db.update(users)
            .set({ is_approved: false, updated_at: new Date() })
            .where(eq(users.id, userId))
            .returning({ id: users.id, name: users.name, email: users.email, is_approved: users.is_approved, company_id: users.company_id });
        return user ?? null;
    }
}
