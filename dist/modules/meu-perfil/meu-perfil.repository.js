"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleMeuPerfilRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const auth_schema_1 = require("../auth/auth.schema");
const profile_db_schema_1 = require("../profiles/profile.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const meu_perfil_db_schema_1 = require("./meu-perfil.db.schema");
class DrizzleMeuPerfilRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findProfile(userId) {
        const [row] = await this.db
            .select({
            id: auth_schema_1.users.id,
            name: auth_schema_1.users.name,
            nickname: auth_schema_1.users.nickname,
            email: auth_schema_1.users.email,
            profile_tag: profile_db_schema_1.profiles.tag,
            profile_name: profile_db_schema_1.profiles.name,
            avatar_url: meu_perfil_db_schema_1.userAvatars.url,
            hide_name_active: auth_schema_1.users.hide_name_active,
        })
            .from(auth_schema_1.users)
            .innerJoin(profile_db_schema_1.profiles, (0, drizzle_orm_1.eq)(auth_schema_1.users.profile_id, profile_db_schema_1.profiles.id))
            .leftJoin(meu_perfil_db_schema_1.userAvatars, (0, drizzle_orm_1.eq)(meu_perfil_db_schema_1.userAvatars.user_id, auth_schema_1.users.id))
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
        if (!row)
            return null;
        const [queueRows, connectionRows] = await Promise.all([
            this.db.select({ id: atendimento_db_schema_1.userQueues.queue_id }).from(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, userId)),
            this.db.select({ id: atendimento_db_schema_1.userConnections.connection_id }).from(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.user_id, userId)),
        ]);
        return { ...row, queue_ids: queueRows.map((q) => q.id), connection_ids: connectionRows.map((c) => c.id) };
    }
    async listOptions(companyId) {
        const [queueList, connectionList] = await Promise.all([
            this.db.select({ id: atendimento_db_schema_1.queues.id, name: atendimento_db_schema_1.queues.name, color: atendimento_db_schema_1.queues.color }).from(atendimento_db_schema_1.queues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId)),
            this.db.select({ id: atendimento_db_schema_1.connections.id, name: atendimento_db_schema_1.connections.name, status: atendimento_db_schema_1.connections.status }).from(atendimento_db_schema_1.connections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId)),
        ]);
        return { queues: queueList, connections: connectionList };
    }
    async updateUser(userId, patch) {
        if (Object.keys(patch).length === 0)
            return;
        await this.db.update(auth_schema_1.users).set({ ...patch, updated_at: new Date() }).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
    }
    async replaceAssignments(userId, companyId, { queueIds, connectionIds }) {
        await this.db.transaction(async (tx) => {
            if (queueIds !== undefined) {
                const owned = await this.ownedQueueIds(tx, companyId, queueIds);
                await tx.delete(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, userId));
                if (owned.length > 0)
                    await tx.insert(atendimento_db_schema_1.userQueues).values(owned.map((queue_id) => ({ user_id: userId, queue_id })));
            }
            if (connectionIds !== undefined) {
                const owned = await this.ownedConnectionIds(tx, companyId, connectionIds);
                await tx.delete(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.user_id, userId));
                if (owned.length > 0)
                    await tx.insert(atendimento_db_schema_1.userConnections).values(owned.map((connection_id) => ({ user_id: userId, connection_id })));
            }
        });
    }
    async findAvatarUrl(userId) {
        const [row] = await this.db.select({ url: meu_perfil_db_schema_1.userAvatars.url }).from(meu_perfil_db_schema_1.userAvatars).where((0, drizzle_orm_1.eq)(meu_perfil_db_schema_1.userAvatars.user_id, userId));
        return row?.url ?? null;
    }
    async saveAvatar(userId, avatar) {
        await this.db.insert(meu_perfil_db_schema_1.userAvatars)
            .values({ ...avatar, user_id: userId })
            .onConflictDoUpdate({ target: meu_perfil_db_schema_1.userAvatars.user_id, set: { ...avatar, updated_at: new Date() } });
    }
    // Sem esse filtro, um admin podia se vincular à fila/conexão de outra
    // empresa e bagunçar a distribuição automática de tickets dela.
    async ownedQueueIds(tx, companyId, ids) {
        if (!companyId || ids.length === 0)
            return [];
        const rows = await tx.select({ id: atendimento_db_schema_1.queues.id }).from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.queues.id, ids)));
        return rows.map((r) => r.id);
    }
    async ownedConnectionIds(tx, companyId, ids) {
        if (!companyId || ids.length === 0)
            return [];
        const rows = await tx.select({ id: atendimento_db_schema_1.connections.id }).from(atendimento_db_schema_1.connections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.connections.id, ids)));
        return rows.map((r) => r.id);
    }
}
exports.DrizzleMeuPerfilRepository = DrizzleMeuPerfilRepository;
//# sourceMappingURL=meu-perfil.repository.js.map