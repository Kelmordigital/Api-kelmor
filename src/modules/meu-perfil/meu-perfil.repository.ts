import { eq, and, inArray } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { users } from '../auth/auth.schema';
import { profiles } from '../profiles/profile.db.schema';
import { queues, connections, userQueues, userConnections } from '../atendimento/atendimento.db.schema';
import { userAvatars } from './meu-perfil.db.schema';

export interface OwnProfile {
    id: string;
    name: string;
    nickname: string | null;
    email: string;
    profile_tag: string;
    profile_name: string;
    avatar_url: string | null;
    hide_name_active: boolean;
    queue_ids: number[];
    connection_ids: number[];
}

export interface ProfileOptions {
    queues: { id: number; name: string; color: string | null }[];
    connections: { id: number; name: string; status: string | null }[];
}

export interface UserFieldsPatch {
    nickname?: string | null;
    hide_name_active?: boolean;
}

export interface AvatarData {
    url: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
}

/** Dados do próprio usuário espalhados entre users, filas/conexões e avatar. */
export interface MeuPerfilRepository {
    findProfile(userId: string): Promise<OwnProfile | null>;
    listOptions(companyId: string): Promise<ProfileOptions>;
    updateUser(userId: string, patch: UserFieldsPatch): Promise<void>;
    /**
     * Substitui as filas/conexões do usuário pelas informadas que pertencem à
     * empresa (ids de outra empresa são descartados). Tudo numa transação.
     */
    replaceAssignments(userId: string, companyId: string | null, assignments: { queueIds?: number[]; connectionIds?: number[] }): Promise<void>;
    findAvatarUrl(userId: string): Promise<string | null>;
    saveAvatar(userId: string, avatar: AvatarData): Promise<void>;
}

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export class DrizzleMeuPerfilRepository implements MeuPerfilRepository {
    constructor(private readonly db: DB) {}

    async findProfile(userId: string): Promise<OwnProfile | null> {
        const [row] = await this.db
            .select({
                id:               users.id,
                name:             users.name,
                nickname:         users.nickname,
                email:            users.email,
                profile_tag:      profiles.tag,
                profile_name:     profiles.name,
                avatar_url:       userAvatars.url,
                hide_name_active: users.hide_name_active,
            })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .leftJoin(userAvatars, eq(userAvatars.user_id, users.id))
            .where(eq(users.id, userId));
        if (!row) return null;

        const [queueRows, connectionRows] = await Promise.all([
            this.db.select({ id: userQueues.queue_id }).from(userQueues).where(eq(userQueues.user_id, userId)),
            this.db.select({ id: userConnections.connection_id }).from(userConnections).where(eq(userConnections.user_id, userId)),
        ]);
        return { ...row, queue_ids: queueRows.map((q) => q.id), connection_ids: connectionRows.map((c) => c.id) };
    }

    async listOptions(companyId: string): Promise<ProfileOptions> {
        const [queueList, connectionList] = await Promise.all([
            this.db.select({ id: queues.id, name: queues.name, color: queues.color }).from(queues).where(eq(queues.company_id, companyId)),
            this.db.select({ id: connections.id, name: connections.name, status: connections.status }).from(connections).where(eq(connections.company_id, companyId)),
        ]);
        return { queues: queueList, connections: connectionList };
    }

    async updateUser(userId: string, patch: UserFieldsPatch): Promise<void> {
        if (Object.keys(patch).length === 0) return;
        await this.db.update(users).set({ ...patch, updated_at: new Date() }).where(eq(users.id, userId));
    }

    async replaceAssignments(userId: string, companyId: string | null, { queueIds, connectionIds }: { queueIds?: number[]; connectionIds?: number[] }): Promise<void> {
        await this.db.transaction(async (tx) => {
            if (queueIds !== undefined) {
                const owned = await this.ownedQueueIds(tx, companyId, queueIds);
                await tx.delete(userQueues).where(eq(userQueues.user_id, userId));
                if (owned.length > 0) await tx.insert(userQueues).values(owned.map((queue_id) => ({ user_id: userId, queue_id })));
            }
            if (connectionIds !== undefined) {
                const owned = await this.ownedConnectionIds(tx, companyId, connectionIds);
                await tx.delete(userConnections).where(eq(userConnections.user_id, userId));
                if (owned.length > 0) await tx.insert(userConnections).values(owned.map((connection_id) => ({ user_id: userId, connection_id })));
            }
        });
    }

    async findAvatarUrl(userId: string): Promise<string | null> {
        const [row] = await this.db.select({ url: userAvatars.url }).from(userAvatars).where(eq(userAvatars.user_id, userId));
        return row?.url ?? null;
    }

    async saveAvatar(userId: string, avatar: AvatarData): Promise<void> {
        await this.db.insert(userAvatars)
            .values({ ...avatar, user_id: userId })
            .onConflictDoUpdate({ target: userAvatars.user_id, set: { ...avatar, updated_at: new Date() } });
    }

    // Sem esse filtro, um admin podia se vincular à fila/conexão de outra
    // empresa e bagunçar a distribuição automática de tickets dela.
    private async ownedQueueIds(tx: Tx, companyId: string | null, ids: number[]): Promise<number[]> {
        if (!companyId || ids.length === 0) return [];
        const rows = await tx.select({ id: queues.id }).from(queues)
            .where(and(eq(queues.company_id, companyId), inArray(queues.id, ids)));
        return rows.map((r) => r.id);
    }

    private async ownedConnectionIds(tx: Tx, companyId: string | null, ids: number[]): Promise<number[]> {
        if (!companyId || ids.length === 0) return [];
        const rows = await tx.select({ id: connections.id }).from(connections)
            .where(and(eq(connections.company_id, companyId), inArray(connections.id, ids)));
        return rows.map((r) => r.id);
    }
}
