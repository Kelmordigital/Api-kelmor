"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleAuthRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const auth_schema_1 = require("./auth.schema");
const profile_db_schema_1 = require("../profiles/profile.db.schema");
const company_db_schema_1 = require("../companies/company.db.schema");
const meu_perfil_db_schema_1 = require("../meu-perfil/meu-perfil.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const userWithProfile = {
    id: auth_schema_1.users.id, name: auth_schema_1.users.name, email: auth_schema_1.users.email, password_hash: auth_schema_1.users.password_hash,
    profile_id: auth_schema_1.users.profile_id, profile_tag: profile_db_schema_1.profiles.tag, company_id: auth_schema_1.users.company_id,
    email_verified: auth_schema_1.users.email_verified, is_approved: auth_schema_1.users.is_approved, finance: auth_schema_1.users.finance,
    totp_enabled: auth_schema_1.users.totp_enabled, hide_name_active: auth_schema_1.users.hide_name_active, avatar_url: meu_perfil_db_schema_1.userAvatars.url,
};
class DrizzleAuthRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findByEmailWithProfile(email) {
        const [row] = await this.db.select(userWithProfile).from(auth_schema_1.users)
            .innerJoin(profile_db_schema_1.profiles, (0, drizzle_orm_1.eq)(auth_schema_1.users.profile_id, profile_db_schema_1.profiles.id))
            .leftJoin(meu_perfil_db_schema_1.userAvatars, (0, drizzle_orm_1.eq)(meu_perfil_db_schema_1.userAvatars.user_id, auth_schema_1.users.id))
            .where((0, drizzle_orm_1.sql) `lower(${auth_schema_1.users.email}) = ${email.toLowerCase()}`);
        return row ?? null;
    }
    async findByIdWithProfile(id) {
        const [row] = await this.db.select(userWithProfile).from(auth_schema_1.users)
            .innerJoin(profile_db_schema_1.profiles, (0, drizzle_orm_1.eq)(auth_schema_1.users.profile_id, profile_db_schema_1.profiles.id))
            .leftJoin(meu_perfil_db_schema_1.userAvatars, (0, drizzle_orm_1.eq)(meu_perfil_db_schema_1.userAvatars.user_id, auth_schema_1.users.id))
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, id));
        return row ?? null;
    }
    async isEmailTaken(email) {
        const [row] = await this.db.select({ id: auth_schema_1.users.id }).from(auth_schema_1.users)
            .where((0, drizzle_orm_1.sql) `lower(${auth_schema_1.users.email}) = ${email.toLowerCase()}`).limit(1);
        return !!row;
    }
    async isCompanyActive(companyId) {
        const [row] = await this.db.select({ status: company_db_schema_1.companies.status }).from(company_db_schema_1.companies).where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId));
        return !!row?.status;
    }
    async companyExists(companyId) {
        const [row] = await this.db.select({ id: company_db_schema_1.companies.id }).from(company_db_schema_1.companies).where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId));
        return !!row;
    }
    async assignmentCounts(userId) {
        const [[q], [c]] = await Promise.all([
            this.db.select({ n: (0, drizzle_orm_1.sql) `count(*)::int` }).from(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, userId)),
            this.db.select({ n: (0, drizzle_orm_1.sql) `count(*)::int` }).from(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.user_id, userId)),
        ]);
        return { queues: q?.n ?? 0, connections: c?.n ?? 0 };
    }
    async create(data) {
        const [user] = await this.db.insert(auth_schema_1.users).values(data).returning();
        return user;
    }
    async approve(userId) {
        const [user] = await this.db.update(auth_schema_1.users)
            .set({ is_approved: true, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId))
            .returning({ id: auth_schema_1.users.id, name: auth_schema_1.users.name, email: auth_schema_1.users.email, is_approved: auth_schema_1.users.is_approved });
        return user ?? null;
    }
    async saveRefreshToken(userId, token, expiresAt) {
        await this.db.insert(auth_schema_1.refreshTokens).values({ user_id: userId, token, expires_at: expiresAt });
    }
    async hasRefreshToken(token) {
        const [row] = await this.db.select({ id: auth_schema_1.refreshTokens.id }).from(auth_schema_1.refreshTokens).where((0, drizzle_orm_1.eq)(auth_schema_1.refreshTokens.token, token));
        return !!row;
    }
    async deleteRefreshToken(token) {
        await this.db.delete(auth_schema_1.refreshTokens).where((0, drizzle_orm_1.eq)(auth_schema_1.refreshTokens.token, token));
    }
    async totpState(userId) {
        const [row] = await this.db.select({ totp_secret: auth_schema_1.users.totp_secret, totp_enabled: auth_schema_1.users.totp_enabled })
            .from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
        return row ?? null;
    }
    async enableTotp(userId, secret, recovery) {
        await this.db.update(auth_schema_1.users)
            .set({ totp_secret: secret, totp_enabled: true, totp_recovery_codes: recovery, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
    }
    async disableTotp(userId) {
        await this.db.update(auth_schema_1.users)
            .set({ totp_secret: null, totp_enabled: false, totp_recovery_codes: null, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
    }
    consumeRecoveryCode(userId, matches) {
        return this.db.transaction(async (tx) => {
            const [locked] = await tx.select({ codes: auth_schema_1.users.totp_recovery_codes })
                .from(auth_schema_1.users).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId), (0, drizzle_orm_1.eq)(auth_schema_1.users.totp_enabled, true))).for('update');
            const codes = (locked?.codes ?? []);
            for (const entry of codes) {
                if (entry.used_at || !(await matches(entry)))
                    continue;
                entry.used_at = new Date().toISOString();
                await tx.update(auth_schema_1.users).set({ totp_recovery_codes: codes, updated_at: new Date() }).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
                return true;
            }
            return false;
        });
    }
}
exports.DrizzleAuthRepository = DrizzleAuthRepository;
//# sourceMappingURL=auth.repository.js.map