"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleUserRepository = exports.EMAIL_TAKEN_MESSAGE = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const http_errors_1 = require("../../core/errors/http-errors");
const pg_errors_1 = require("../../core/database/pg-errors");
const auth_schema_1 = require("../auth/auth.schema");
const profile_db_schema_1 = require("../profiles/profile.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const meu_perfil_db_schema_1 = require("../meu-perfil/meu-perfil.db.schema");
exports.EMAIL_TAKEN_MESSAGE = 'E-mail já cadastrado';
class DrizzleUserRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async listByCompany(companyId) {
        const list = await this.db
            .select({
            id: auth_schema_1.users.id, name: auth_schema_1.users.name, nickname: auth_schema_1.users.nickname, email: auth_schema_1.users.email,
            profile_id: auth_schema_1.users.profile_id, profile_tag: profile_db_schema_1.profiles.tag, profile_name: profile_db_schema_1.profiles.name,
            is_approved: auth_schema_1.users.is_approved, created_at: auth_schema_1.users.created_at, avatar_url: meu_perfil_db_schema_1.userAvatars.url,
        })
            .from(auth_schema_1.users)
            .innerJoin(profile_db_schema_1.profiles, (0, drizzle_orm_1.eq)(auth_schema_1.users.profile_id, profile_db_schema_1.profiles.id))
            .leftJoin(meu_perfil_db_schema_1.userAvatars, (0, drizzle_orm_1.eq)(meu_perfil_db_schema_1.userAvatars.user_id, auth_schema_1.users.id))
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId));
        if (list.length === 0)
            return [];
        const ids = list.map((u) => u.id);
        const [queueRows, connectionRows] = await Promise.all([
            this.db.select().from(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.userQueues.user_id, ids)),
            this.db.select().from(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.userConnections.user_id, ids)),
        ]);
        return list.map((u) => ({
            ...u,
            queue_ids: queueRows.filter((q) => q.user_id === u.id).map((q) => q.queue_id),
            connection_ids: connectionRows.filter((c) => c.user_id === u.id).map((c) => c.connection_id),
        }));
    }
    async findInCompany(id, companyId) {
        const [row] = await this.db.select({ id: auth_schema_1.users.id, profile_id: auth_schema_1.users.profile_id }).from(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.id, id), (0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId))).limit(1);
        return row ?? null;
    }
    async isEmailTaken(email, exceptUserId) {
        const conditions = [(0, drizzle_orm_1.eq)(auth_schema_1.users.email, email)];
        if (exceptUserId)
            conditions.push((0, drizzle_orm_1.ne)(auth_schema_1.users.id, exceptUserId));
        const [row] = await this.db.select({ id: auth_schema_1.users.id }).from(auth_schema_1.users).where((0, drizzle_orm_1.and)(...conditions)).limit(1);
        return !!row;
    }
    async profileById(id) {
        const [row] = await this.db.select({ id: profile_db_schema_1.profiles.id, tag: profile_db_schema_1.profiles.tag }).from(profile_db_schema_1.profiles).where((0, drizzle_orm_1.eq)(profile_db_schema_1.profiles.id, id));
        return row ?? null;
    }
    async profileByTag(tag) {
        const [row] = await this.db.select({ id: profile_db_schema_1.profiles.id, tag: profile_db_schema_1.profiles.tag }).from(profile_db_schema_1.profiles).where((0, drizzle_orm_1.eq)(profile_db_schema_1.profiles.tag, tag));
        return row ?? null;
    }
    create(companyId, data, assignments) {
        return this.uniqueEmail(() => this.db.transaction(async (tx) => {
            const [user] = await tx.insert(auth_schema_1.users)
                .values({ ...data, company_id: companyId, is_approved: true, email_verified: true })
                .returning();
            const saved = await this.replaceAssignments(tx, user.id, companyId, assignments);
            const { password_hash: _h, totp_secret: _s, totp_recovery_codes: _r, ...publicUser } = user;
            return { ...publicUser, queue_ids: saved.queueIds ?? [], connection_ids: saved.connectionIds ?? [] };
        }));
    }
    update(id, companyId, patch, assignments) {
        return this.uniqueEmail(() => this.db.transaction(async (tx) => {
            if (Object.keys(patch).length > 0) {
                await tx.update(auth_schema_1.users).set({ ...patch, updated_at: new Date() })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.id, id), (0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId)));
            }
            await this.replaceAssignments(tx, id, companyId, assignments);
        }));
    }
    async delete(id, companyId) {
        const [row] = await this.db.delete(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.id, id), (0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId)))
            .returning({ id: auth_schema_1.users.id });
        return !!row;
    }
    async deleteRefreshTokens(userId) {
        await this.db.delete(auth_schema_1.refreshTokens).where((0, drizzle_orm_1.eq)(auth_schema_1.refreshTokens.user_id, userId));
    }
    async listQueues(companyId) {
        return this.db.select({ id: atendimento_db_schema_1.queues.id, name: atendimento_db_schema_1.queues.name, color: atendimento_db_schema_1.queues.color }).from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId));
    }
    async listConnections(companyId) {
        return this.db.select({ id: atendimento_db_schema_1.connections.id, name: atendimento_db_schema_1.connections.name, status: atendimento_db_schema_1.connections.status }).from(atendimento_db_schema_1.connections)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId));
    }
    /**
     * Substitui as associações enviadas, só com filas/conexões da empresa —
     * sem esse filtro dava para vincular fila/conexão de outra empresa a um usuário.
     */
    async replaceAssignments(tx, userId, companyId, { queueIds, connectionIds }) {
        const saved = {};
        if (queueIds !== undefined) {
            const owned = queueIds.length === 0 ? [] : (await tx.select({ id: atendimento_db_schema_1.queues.id }).from(atendimento_db_schema_1.queues)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.queues.id, queueIds)))).map((q) => q.id);
            await tx.delete(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, userId));
            if (owned.length > 0)
                await tx.insert(atendimento_db_schema_1.userQueues).values(owned.map((queue_id) => ({ user_id: userId, queue_id })));
            saved.queueIds = owned;
        }
        if (connectionIds !== undefined) {
            const owned = connectionIds.length === 0 ? [] : (await tx.select({ id: atendimento_db_schema_1.connections.id }).from(atendimento_db_schema_1.connections)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.connections.id, connectionIds)))).map((c) => c.id);
            await tx.delete(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.user_id, userId));
            if (owned.length > 0)
                await tx.insert(atendimento_db_schema_1.userConnections).values(owned.map((connection_id) => ({ user_id: userId, connection_id })));
            saved.connectionIds = owned;
        }
        return saved;
    }
    /** Duas gravações simultâneas com o mesmo e-mail: o índice único decide. */
    async uniqueEmail(write) {
        try {
            return await write();
        }
        catch (err) {
            if ((0, pg_errors_1.isUniqueViolation)(err))
                throw new http_errors_1.ConflictError(exports.EMAIL_TAKEN_MESSAGE);
            throw err;
        }
    }
}
exports.DrizzleUserRepository = DrizzleUserRepository;
//# sourceMappingURL=usuario.repository.js.map