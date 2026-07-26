import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { db } from '../../database/client';
import { users } from '../auth/auth.schema';
import { profiles } from '../profiles/profile.db.schema';
import { queues, connections, userQueues, userConnections } from '../atendimento/atendimento.db.schema';
import { userAvatars } from './meu-perfil.db.schema';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5MB

export const meuPerfilService = {

    async getProfile(userId: string) {
        const [row] = await db
            .select({
                id: users.id,
                name: users.name,
                nickname: users.nickname,
                email: users.email,
                profile_tag: profiles.tag,
                profile_name: profiles.name,
                avatar_url: userAvatars.url,
                hide_name_active: users.hide_name_active,
            })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .leftJoin(userAvatars, eq(userAvatars.user_id, users.id))
            .where(eq(users.id, userId));

        if (!row) return null;

        const [queueAssocs, connAssocs] = await Promise.all([
            db.select({ queue_id: userQueues.queue_id }).from(userQueues).where(eq(userQueues.user_id, userId)),
            db.select({ connection_id: userConnections.connection_id }).from(userConnections).where(eq(userConnections.user_id, userId)),
        ]);

        return {
            ...row,
            queue_ids: queueAssocs.map((q) => q.queue_id),
            connection_ids: connAssocs.map((c) => c.connection_id),
        };
    },

    async listSelects(companyId: string) {
        const [queueList, connectionList] = await Promise.all([
            db.select({ id: queues.id, name: queues.name, color: queues.color }).from(queues).where(eq(queues.company_id, companyId)),
            db.select({ id: connections.id, name: connections.name, status: connections.status }).from(connections).where(eq(connections.company_id, companyId)),
        ]);
        return { queues: queueList, connections: connectionList };
    },

    async updateProfile(userId: string, payload: {
        nickname?: string | null;
        queue_ids?: number[];
        connection_ids?: number[];
        hide_name_active?: boolean;
    }) {
        if (payload.nickname !== undefined) {
            await db.update(users)
                .set({ nickname: payload.nickname?.trim() || null, updated_at: new Date() })
                .where(eq(users.id, userId));
        }

        if (payload.hide_name_active !== undefined) {
            await db.update(users)
                .set({ hide_name_active: payload.hide_name_active, updated_at: new Date() })
                .where(eq(users.id, userId));
        }

        if (payload.queue_ids !== undefined) {
            await db.delete(userQueues).where(eq(userQueues.user_id, userId));
            if (payload.queue_ids.length > 0) {
                await db.insert(userQueues).values(
                    payload.queue_ids.map((qid) => ({ user_id: userId, queue_id: qid }))
                );
            }
        }

        if (payload.connection_ids !== undefined) {
            await db.delete(userConnections).where(eq(userConnections.user_id, userId));
            if (payload.connection_ids.length > 0) {
                await db.insert(userConnections).values(
                    payload.connection_ids.map((cid) => ({ user_id: userId, connection_id: cid }))
                );
            }
        }

        return { ok: true };
    },

    isAllowedMimeType(mimeType: string): boolean {
        return ALLOWED_MIME_TYPES.includes(mimeType);
    },

    isWithinMaxSize(sizeBytes: number): boolean {
        return sizeBytes <= AVATAR_MAX_BYTES;
    },

    async saveAvatar(userId: string, file: { buffer: Buffer; originalName: string; mimeType: string }) {
        const [existing] = await db.select().from(userAvatars).where(eq(userAvatars.user_id, userId));

        if (existing) {
            const oldPath = path.join(process.cwd(), existing.url.replace(/^\//, ''));
            try {
                await fs.unlink(oldPath);
            } catch {
                // arquivo já pode não existir mais em disco — não é fatal
            }
        }

        const ext = path.extname(file.originalName).toLowerCase().slice(0, 10) || '';
        const dir = path.join(process.cwd(), 'uploads', 'avatars', userId);
        await fs.mkdir(dir, { recursive: true });

        const fileName = `${randomUUID()}${ext}`;
        await fs.writeFile(path.join(dir, fileName), file.buffer);

        const url = `/uploads/avatars/${userId}/${fileName}`;

        if (existing) {
            await db.update(userAvatars).set({
                url,
                original_name: file.originalName,
                mime_type: file.mimeType,
                size_bytes: file.buffer.length,
                updated_at: new Date(),
            }).where(eq(userAvatars.user_id, userId));
        } else {
            await db.insert(userAvatars).values({
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
