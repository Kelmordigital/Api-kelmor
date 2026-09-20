"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.meuPerfilService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const crypto_1 = require("crypto");
const client_1 = require("../../database/client");
const auth_schema_1 = require("../auth/auth.schema");
const profile_db_schema_1 = require("../profiles/profile.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const meu_perfil_db_schema_1 = require("./meu-perfil.db.schema");
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5MB
// Restringe os ids recebidos do cliente aos que realmente pertencem à
// empresa — sem isso, um admin podia se autovincular à fila/conexão de
// outra empresa e corromper a distribuição automática de tickets alheia.
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
exports.meuPerfilService = {
    async getProfile(userId) {
        const [row] = await client_1.db
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
        const [queueAssocs, connAssocs] = await Promise.all([
            client_1.db.select({ queue_id: atendimento_db_schema_1.userQueues.queue_id }).from(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, userId)),
            client_1.db.select({ connection_id: atendimento_db_schema_1.userConnections.connection_id }).from(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.user_id, userId)),
        ]);
        return {
            ...row,
            queue_ids: queueAssocs.map((q) => q.queue_id),
            connection_ids: connAssocs.map((c) => c.connection_id),
        };
    },
    async listSelects(companyId) {
        const [queueList, connectionList] = await Promise.all([
            client_1.db.select({ id: atendimento_db_schema_1.queues.id, name: atendimento_db_schema_1.queues.name, color: atendimento_db_schema_1.queues.color }).from(atendimento_db_schema_1.queues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId)),
            client_1.db.select({ id: atendimento_db_schema_1.connections.id, name: atendimento_db_schema_1.connections.name, status: atendimento_db_schema_1.connections.status }).from(atendimento_db_schema_1.connections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId)),
        ]);
        return { queues: queueList, connections: connectionList };
    },
    async updateProfile(userId, companyId, payload) {
        if (payload.nickname !== undefined) {
            await client_1.db.update(auth_schema_1.users)
                .set({ nickname: payload.nickname?.trim() || null, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
        }
        if (payload.hide_name_active !== undefined) {
            await client_1.db.update(auth_schema_1.users)
                .set({ hide_name_active: payload.hide_name_active, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId));
        }
        if (payload.queue_ids !== undefined) {
            await client_1.db.delete(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, userId));
            const safeQueueIds = await filterOwnedQueueIds(companyId, payload.queue_ids);
            if (safeQueueIds.length > 0) {
                await client_1.db.insert(atendimento_db_schema_1.userQueues).values(safeQueueIds.map((qid) => ({ user_id: userId, queue_id: qid })));
            }
        }
        if (payload.connection_ids !== undefined) {
            await client_1.db.delete(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.user_id, userId));
            const safeConnectionIds = await filterOwnedConnectionIds(companyId, payload.connection_ids);
            if (safeConnectionIds.length > 0) {
                await client_1.db.insert(atendimento_db_schema_1.userConnections).values(safeConnectionIds.map((cid) => ({ user_id: userId, connection_id: cid })));
            }
        }
        return { ok: true };
    },
    isAllowedMimeType(mimeType) {
        return ALLOWED_MIME_TYPES.includes(mimeType);
    },
    isWithinMaxSize(sizeBytes) {
        return sizeBytes <= AVATAR_MAX_BYTES;
    },
    async saveAvatar(userId, file) {
        const [existing] = await client_1.db.select().from(meu_perfil_db_schema_1.userAvatars).where((0, drizzle_orm_1.eq)(meu_perfil_db_schema_1.userAvatars.user_id, userId));
        if (existing) {
            const oldPath = path_1.default.join(process.cwd(), existing.url.replace(/^\//, ''));
            try {
                await promises_1.default.unlink(oldPath);
            }
            catch {
                // arquivo já pode não existir mais em disco — não é fatal
            }
        }
        const ext = path_1.default.extname(file.originalName).toLowerCase().slice(0, 10) || '';
        const dir = path_1.default.join(process.cwd(), 'uploads', 'avatars', userId);
        await promises_1.default.mkdir(dir, { recursive: true });
        const fileName = `${(0, crypto_1.randomUUID)()}${ext}`;
        await promises_1.default.writeFile(path_1.default.join(dir, fileName), file.buffer);
        const url = `/uploads/avatars/${userId}/${fileName}`;
        if (existing) {
            await client_1.db.update(meu_perfil_db_schema_1.userAvatars).set({
                url,
                original_name: file.originalName,
                mime_type: file.mimeType,
                size_bytes: file.buffer.length,
                updated_at: new Date(),
            }).where((0, drizzle_orm_1.eq)(meu_perfil_db_schema_1.userAvatars.user_id, userId));
        }
        else {
            await client_1.db.insert(meu_perfil_db_schema_1.userAvatars).values({
                user_id: userId,
                url,
                original_name: file.originalName,
                mime_type: file.mimeType,
                size_bytes: file.buffer.length,
            });
        }
        return { avatar_url: url };
    },
};
//# sourceMappingURL=meu-perfil.service.js.map