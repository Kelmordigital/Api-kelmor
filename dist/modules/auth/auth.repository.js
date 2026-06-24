"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const auth_schema_1 = require("./auth.schema");
const profile_db_schema_1 = require("../profiles/profile.db.schema");
const company_db_schema_1 = require("../companies/company.db.schema");
exports.authRepository = {
    async findByEmailWithProfile(email) {
        const [result] = await client_1.db
            .select({
            id: auth_schema_1.users.id,
            name: auth_schema_1.users.name,
            email: auth_schema_1.users.email,
            password_hash: auth_schema_1.users.password_hash,
            profile_id: auth_schema_1.users.profile_id,
            profile_tag: profile_db_schema_1.profiles.tag,
            company_id: auth_schema_1.users.company_id,
            email_verified: auth_schema_1.users.email_verified,
            is_approved: auth_schema_1.users.is_approved,
            finance: auth_schema_1.users.finance,
        })
            .from(auth_schema_1.users)
            .innerJoin(profile_db_schema_1.profiles, (0, drizzle_orm_1.eq)(auth_schema_1.users.profile_id, profile_db_schema_1.profiles.id))
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.email, email));
        return result ?? null;
    },
    async findByEmail(email) {
        const [user] = await client_1.db.select().from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.email, email));
        return user ?? null;
    },
    async findById(id) {
        const [user] = await client_1.db.select().from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, id));
        return user ?? null;
    },
    async findCompanyById(companyId) {
        const [company] = await client_1.db
            .select({ id: company_db_schema_1.companies.id, status: company_db_schema_1.companies.status })
            .from(company_db_schema_1.companies)
            .where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId));
        return company ?? null;
    },
    async create(data) {
        const [user] = await client_1.db.insert(auth_schema_1.users).values(data).returning();
        return user;
    },
    async approveUser(userId) {
        const [user] = await client_1.db
            .update(auth_schema_1.users)
            .set({ is_approved: true, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId))
            .returning({
            id: auth_schema_1.users.id,
            name: auth_schema_1.users.name,
            email: auth_schema_1.users.email,
            is_approved: auth_schema_1.users.is_approved,
        });
        return user ?? null;
    },
    async saveRefreshToken(userId, token, expiresAt) {
        await client_1.db.insert(auth_schema_1.refreshTokens).values({ user_id: userId, token, expires_at: expiresAt });
    },
    async findRefreshToken(token) {
        const [t] = await client_1.db.select().from(auth_schema_1.refreshTokens).where((0, drizzle_orm_1.eq)(auth_schema_1.refreshTokens.token, token));
        return t ?? null;
    },
    async deleteRefreshToken(token) {
        await client_1.db.delete(auth_schema_1.refreshTokens).where((0, drizzle_orm_1.eq)(auth_schema_1.refreshTokens.token, token));
    },
    async deleteAllRefreshTokens(userId) {
        await client_1.db.delete(auth_schema_1.refreshTokens).where((0, drizzle_orm_1.eq)(auth_schema_1.refreshTokens.user_id, userId));
    },
};
//# sourceMappingURL=auth.repository.js.map