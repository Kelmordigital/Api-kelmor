"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const auth_schema_1 = require("./auth.schema");
exports.authRepository = {
    async findByEmail(email) {
        const [user] = await client_1.db.select().from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.email, email));
        return user ?? null;
    },
    async findById(id) {
        const [user] = await client_1.db.select().from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, id));
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