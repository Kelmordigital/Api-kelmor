"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usuarioService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("../../database/client");
const auth_schema_1 = require("../auth/auth.schema");
const profile_db_schema_1 = require("../profiles/profile.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const meu_perfil_db_schema_1 = require("../meu-perfil/meu-perfil.db.schema");
const achievements_service_1 = require("../achievements/achievements.service");
// Restringe os ids recebidos do cliente aos que realmente pertencem à
// empresa — sem isso, dava pra vincular fila/conexão de outra empresa a um
// usuário só enviando o id.
async function filterOwnedQueueIds(companyId, ids) {
    if (ids.length === 0)
        return [];
    const owned = await client_1.db.select({ id: atendimento_db_schema_1.queues.id }).from(atendimento_db_schema_1.queues)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.queues.id, ids)));
    return owned.map(o => o.id);
}
async function filterOwnedConnectionIds(companyId, ids) {
    if (ids.length === 0)
        return [];
    const owned = await client_1.db.select({ id: atendimento_db_schema_1.connections.id }).from(atendimento_db_schema_1.connections)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.connections.id, ids)));
    return owned.map(o => o.id);
}
exports.usuarioService = {
    async list(companyId) {
        const userList = await client_1.db
            .select({
            id: auth_schema_1.users.id,
            name: auth_schema_1.users.name,
            nickname: auth_schema_1.users.nickname,
            email: auth_schema_1.users.email,
            profile_id: auth_schema_1.users.profile_id,
            profile_tag: profile_db_schema_1.profiles.tag,
            profile_name: profile_db_schema_1.profiles.name,
            is_approved: auth_schema_1.users.is_approved,
            created_at: auth_schema_1.users.created_at,
            avatar_url: meu_perfil_db_schema_1.userAvatars.url,
        })
            .from(auth_schema_1.users)
            .innerJoin(profile_db_schema_1.profiles, (0, drizzle_orm_1.eq)(auth_schema_1.users.profile_id, profile_db_schema_1.profiles.id))
            .leftJoin(meu_perfil_db_schema_1.userAvatars, (0, drizzle_orm_1.eq)(meu_perfil_db_schema_1.userAvatars.user_id, auth_schema_1.users.id))
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId));
        if (userList.length === 0)
            return [];
        const userIds = userList.map((u) => u.id);
        const [queueAssocs, connAssocs, progressByUser] = await Promise.all([
            client_1.db.select().from(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.userQueues.user_id, userIds)),
            client_1.db.select().from(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.userConnections.user_id, userIds)),
            achievements_service_1.achievementsService.getCompanyProgress(companyId, userIds),
        ]);
        return userList.map((u) => ({
            ...u,
            queue_ids: queueAssocs.filter((q) => q.user_id === u.id).map((q) => q.queue_id),
            connection_ids: connAssocs.filter((c) => c.user_id === u.id).map((c) => c.connection_id),
            patente: progressByUser[u.id]?.patente ?? 'Aprendiz',
            patente_sub_level: progressByUser[u.id]?.sub_level ?? null,
        }));
    },
    async create(companyId, payload) {
        const existing = await client_1.db
            .select({ id: auth_schema_1.users.id })
            .from(auth_schema_1.users)
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.email, payload.email.toLowerCase()))
            .limit(1);
        if (existing.length > 0)
            throw new Error('EMAIL_TAKEN');
        const password_hash = await bcryptjs_1.default.hash(payload.password, 10);
        const [user] = await client_1.db.insert(auth_schema_1.users).values({
            name: payload.name,
            email: payload.email.toLowerCase(),
            password_hash,
            profile_id: payload.profile_id,
            company_id: companyId,
            is_approved: true,
            email_verified: true,
        }).returning();
        if (payload.queue_ids?.length) {
            await client_1.db.insert(atendimento_db_schema_1.userQueues).values(payload.queue_ids.map((qid) => ({ user_id: user.id, queue_id: qid })));
        }
        if (payload.connection_ids?.length) {
            await client_1.db.insert(atendimento_db_schema_1.userConnections).values(payload.connection_ids.map((cid) => ({ user_id: user.id, connection_id: cid })));
        }
        return {
            ...user,
            queue_ids: payload.queue_ids ?? [],
            connection_ids: payload.connection_ids ?? [],
        };
    },
    async update(id, companyId, payload) {
        // Confirma que o usuário alvo é da própria empresa ANTES de mexer nas
        // tabelas de junção — sem isso, enviar só queue_ids/connection_ids
        // (sem name/email/...) pulava o update em `users` (corretamente
        // escopado) e ainda assim reatribuía fila/conexão de um usuário de
        // outra empresa, usando só o `id` cru.
        const [owned] = await client_1.db.select({ id: auth_schema_1.users.id }).from(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.id, id), (0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId)))
            .limit(1);
        if (!owned)
            return null;
        const updateData = {};
        if (payload.name)
            updateData.name = payload.name;
        if (payload.email)
            updateData.email = payload.email.toLowerCase();
        if (payload.password)
            updateData.password_hash = await bcryptjs_1.default.hash(payload.password, 10);
        if (payload.profile_id)
            updateData.profile_id = payload.profile_id;
        if (Object.keys(updateData).length > 0) {
            updateData.updated_at = new Date();
            await client_1.db.update(auth_schema_1.users).set(updateData).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, id));
        }
        if (payload.queue_ids !== undefined) {
            await client_1.db.delete(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, id));
            const safeQueueIds = await filterOwnedQueueIds(companyId, payload.queue_ids);
            if (safeQueueIds.length > 0) {
                await client_1.db.insert(atendimento_db_schema_1.userQueues).values(safeQueueIds.map((qid) => ({ user_id: id, queue_id: qid })));
            }
        }
        if (payload.connection_ids !== undefined) {
            await client_1.db.delete(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.user_id, id));
            const safeConnectionIds = await filterOwnedConnectionIds(companyId, payload.connection_ids);
            if (safeConnectionIds.length > 0) {
                await client_1.db.insert(atendimento_db_schema_1.userConnections).values(safeConnectionIds.map((cid) => ({ user_id: id, connection_id: cid })));
            }
        }
        return { id };
    },
    async remove(id, companyId) {
        const [row] = await client_1.db
            .delete(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.id, id), (0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId)))
            .returning({ id: auth_schema_1.users.id });
        return !!row;
    },
    async listQueues(companyId) {
        return client_1.db
            .select({ id: atendimento_db_schema_1.queues.id, name: atendimento_db_schema_1.queues.name, color: atendimento_db_schema_1.queues.color })
            .from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId));
    },
    async listConnections(companyId) {
        return client_1.db
            .select({ id: atendimento_db_schema_1.connections.id, name: atendimento_db_schema_1.connections.name, status: atendimento_db_schema_1.connections.status })
            .from(atendimento_db_schema_1.connections)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId));
    },
};
//# sourceMappingURL=usuario.service.js.map