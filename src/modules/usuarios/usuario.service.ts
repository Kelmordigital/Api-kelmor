import { eq, and, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../../database/client';
import { users } from '../auth/auth.schema';
import { profiles } from '../profiles/profile.db.schema';
import { queues, connections, userQueues, userConnections } from '../atendimento/atendimento.db.schema';
import { userAvatars } from '../meu-perfil/meu-perfil.db.schema';
import { achievementsService } from '../achievements/achievements.service';

// Restringe os ids recebidos do cliente aos que realmente pertencem à
// empresa — sem isso, dava pra vincular fila/conexão de outra empresa a um
// usuário só enviando o id.
async function filterOwnedQueueIds(companyId: string, ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const owned = await db.select({ id: queues.id }).from(queues)
        .where(and(eq(queues.company_id, companyId), inArray(queues.id, ids)));
    return owned.map(o => o.id);
}

async function filterOwnedConnectionIds(companyId: string, ids: number[]): Promise<number[]> {
    if (ids.length === 0) return [];
    const owned = await db.select({ id: connections.id }).from(connections)
        .where(and(eq(connections.company_id, companyId), inArray(connections.id, ids)));
    return owned.map(o => o.id);
}

export const usuarioService = {

    async list(companyId: string) {
        const userList = await db
            .select({
                id: users.id,
                name: users.name,
                nickname: users.nickname,
                email: users.email,
                profile_id: users.profile_id,
                profile_tag: profiles.tag,
                profile_name: profiles.name,
                is_approved: users.is_approved,
                created_at: users.created_at,
                avatar_url: userAvatars.url,
            })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .leftJoin(userAvatars, eq(userAvatars.user_id, users.id))
            .where(eq(users.company_id, companyId));

        if (userList.length === 0) return [];

        const userIds = userList.map((u) => u.id);

        const [queueAssocs, connAssocs, progressByUser] = await Promise.all([
            db.select().from(userQueues).where(inArray(userQueues.user_id, userIds)),
            db.select().from(userConnections).where(inArray(userConnections.user_id, userIds)),
            achievementsService.getCompanyProgress(companyId, userIds),
        ]);

        return userList.map((u) => ({
            ...u,
            queue_ids: queueAssocs.filter((q) => q.user_id === u.id).map((q) => q.queue_id),
            connection_ids: connAssocs.filter((c) => c.user_id === u.id).map((c) => c.connection_id),
            patente: progressByUser[u.id]?.patente ?? 'Aprendiz',
            patente_sub_level: progressByUser[u.id]?.sub_level ?? null,
        }));
    },

    async create(companyId: string, payload: {
        name: string;
        email: string;
        password: string;
        profile_id: number;
        queue_ids?: number[];
        connection_ids?: number[];
    }) {
        const existing = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, payload.email.toLowerCase()))
            .limit(1);
        if (existing.length > 0) throw new Error('EMAIL_TAKEN');

        const password_hash = await bcrypt.hash(payload.password, 10);
        const [user] = await db.insert(users).values({
            name: payload.name,
            email: payload.email.toLowerCase(),
            password_hash,
            profile_id: payload.profile_id,
            company_id: companyId,
            is_approved: true,
            email_verified: true,
        }).returning();

        if (payload.queue_ids?.length) {
            await db.insert(userQueues).values(
                payload.queue_ids.map((qid) => ({ user_id: user.id, queue_id: qid }))
            );
        }
        if (payload.connection_ids?.length) {
            await db.insert(userConnections).values(
                payload.connection_ids.map((cid) => ({ user_id: user.id, connection_id: cid }))
            );
        }

        return {
            ...user,
            queue_ids: payload.queue_ids ?? [],
            connection_ids: payload.connection_ids ?? [],
        };
    },

    async update(id: string, companyId: string, payload: {
        name?: string;
        email?: string;
        password?: string;
        profile_id?: number;
        queue_ids?: number[];
        connection_ids?: number[];
    }) {
        // Confirma que o usuário alvo é da própria empresa ANTES de mexer nas
        // tabelas de junção — sem isso, enviar só queue_ids/connection_ids
        // (sem name/email/...) pulava o update em `users` (corretamente
        // escopado) e ainda assim reatribuía fila/conexão de um usuário de
        // outra empresa, usando só o `id` cru.
        const [owned] = await db.select({ id: users.id }).from(users)
            .where(and(eq(users.id, id), eq(users.company_id, companyId)))
            .limit(1);
        if (!owned) return null;

        const updateData: Record<string, unknown> = {};
        if (payload.name) updateData.name = payload.name;
        if (payload.email) updateData.email = payload.email.toLowerCase();
        if (payload.password) updateData.password_hash = await bcrypt.hash(payload.password, 10);
        if (payload.profile_id) updateData.profile_id = payload.profile_id;

        if (Object.keys(updateData).length > 0) {
            updateData.updated_at = new Date();
            await db.update(users).set(updateData).where(eq(users.id, id));
        }

        if (payload.queue_ids !== undefined) {
            await db.delete(userQueues).where(eq(userQueues.user_id, id));
            const safeQueueIds = await filterOwnedQueueIds(companyId, payload.queue_ids);
            if (safeQueueIds.length > 0) {
                await db.insert(userQueues).values(
                    safeQueueIds.map((qid) => ({ user_id: id, queue_id: qid }))
                );
            }
        }

        if (payload.connection_ids !== undefined) {
            await db.delete(userConnections).where(eq(userConnections.user_id, id));
            const safeConnectionIds = await filterOwnedConnectionIds(companyId, payload.connection_ids);
            if (safeConnectionIds.length > 0) {
                await db.insert(userConnections).values(
                    safeConnectionIds.map((cid) => ({ user_id: id, connection_id: cid }))
                );
            }
        }

        return { id };
    },

    async remove(id: string, companyId: string): Promise<boolean> {
        const [row] = await db
            .delete(users)
            .where(and(eq(users.id, id), eq(users.company_id, companyId)))
            .returning({ id: users.id });
        return !!row;
    },

    async listQueues(companyId: string) {
        return db
            .select({ id: queues.id, name: queues.name, color: queues.color })
            .from(queues)
            .where(eq(queues.company_id, companyId));
    },

    async listConnections(companyId: string) {
        return db
            .select({ id: connections.id, name: connections.name, status: connections.status })
            .from(connections)
            .where(eq(connections.company_id, companyId));
    },
};
