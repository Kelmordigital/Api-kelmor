"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.superadminService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("../../database/client");
const company_db_schema_1 = require("../companies/company.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
const profile_db_schema_1 = require("../profiles/profile.db.schema");
/** Situação exibida no painel: INATIVA vence; senão PENDENTE se o admin não foi aprovado. */
function deriveSituacao(status, admin) {
    if (!status)
        return 'INATIVA';
    if (admin && !admin.is_approved)
        return 'PENDENTE';
    return 'ATIVA';
}
exports.superadminService = {
    async stats() {
        const cos = await client_1.db.select({ status: company_db_schema_1.companies.status }).from(company_db_schema_1.companies);
        // pendentes = usuários de perfil admin com is_approved=false (spec)
        const admins = await client_1.db
            .select({ is_approved: auth_schema_1.users.is_approved })
            .from(auth_schema_1.users)
            .innerJoin(profile_db_schema_1.profiles, (0, drizzle_orm_1.eq)(auth_schema_1.users.profile_id, profile_db_schema_1.profiles.id))
            .where((0, drizzle_orm_1.eq)(profile_db_schema_1.profiles.tag, 'admin'));
        const pendentes = admins.filter(a => !a.is_approved).length;
        const ativas = cos.filter(c => c.status).length;
        return { total: cos.length, ativas, inativas: cos.length - ativas, pendentes };
    },
    async listCompanies() {
        const cos = await client_1.db.select().from(company_db_schema_1.companies).orderBy((0, drizzle_orm_1.desc)(company_db_schema_1.companies.created_at));
        const allUsers = await client_1.db
            .select({
            id: auth_schema_1.users.id,
            name: auth_schema_1.users.name,
            email: auth_schema_1.users.email,
            is_approved: auth_schema_1.users.is_approved,
            company_id: auth_schema_1.users.company_id,
            created_at: auth_schema_1.users.created_at,
            profile_tag: profile_db_schema_1.profiles.tag,
        })
            .from(auth_schema_1.users)
            .innerJoin(profile_db_schema_1.profiles, (0, drizzle_orm_1.eq)(auth_schema_1.users.profile_id, profile_db_schema_1.profiles.id))
            .where((0, drizzle_orm_1.isNotNull)(auth_schema_1.users.company_id));
        return cos.map(co => {
            const companyUsers = allUsers.filter(u => u.company_id === co.id);
            // "o admin da empresa" = usuário de perfil admin mais antigo (spec)
            const admins = companyUsers
                .filter(u => u.profile_tag === 'admin')
                .sort((a, b) => (new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime())
                || a.id.localeCompare(b.id));
            const admin = admins[0]
                ? { id: admins[0].id, name: admins[0].name, email: admins[0].email, is_approved: admins[0].is_approved }
                : null;
            // Equipe completa: admins primeiro, depois por antiguidade (mesmo tie-break por id)
            const team = [...companyUsers]
                .sort((a, b) => (Number(b.profile_tag === 'admin') - Number(a.profile_tag === 'admin'))
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
    async createCompany(payload) {
        const [existing] = await client_1.db.select({ id: auth_schema_1.users.id }).from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.email, payload.admin.email));
        if (existing)
            return 'email_conflict';
        const [adminProfile] = await client_1.db.select({ id: profile_db_schema_1.profiles.id }).from(profile_db_schema_1.profiles).where((0, drizzle_orm_1.eq)(profile_db_schema_1.profiles.tag, 'admin'));
        const password_hash = await bcryptjs_1.default.hash(payload.admin.password, 10);
        return client_1.db.transaction(async (tx) => {
            const [company] = await tx.insert(company_db_schema_1.companies)
                .values({ name: payload.name, cnpj_cpf: payload.cnpj_cpf ?? null, status: true })
                .returning();
            const [admin] = await tx.insert(auth_schema_1.users).values({
                name: payload.admin.name,
                email: payload.admin.email,
                password_hash,
                profile_id: adminProfile.id,
                company_id: company.id,
                email_verified: true,
                is_approved: false, // nasce bloqueado — aprovação manual do superAdmin
                finance: true, // dono da empresa, mesmo padrão do seed
            }).returning();
            return { company, admin };
        });
    },
    async updateCompany(id, data) {
        const [company] = await client_1.db.update(company_db_schema_1.companies)
            .set({ ...data, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, id))
            .returning();
        return company ?? null;
    },
    async setCompanyStatus(id, status) {
        const [company] = await client_1.db.update(company_db_schema_1.companies)
            .set({ status, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, id))
            .returning();
        return company ?? null;
    },
    /** Revoga a aprovação de login (is_approved=false). */
    async revokeUser(userId) {
        const [user] = await client_1.db.update(auth_schema_1.users)
            .set({ is_approved: false, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId))
            .returning({ id: auth_schema_1.users.id, name: auth_schema_1.users.name, email: auth_schema_1.users.email, is_approved: auth_schema_1.users.is_approved });
        return user ?? null;
    },
};
//# sourceMappingURL=superadmin.service.js.map