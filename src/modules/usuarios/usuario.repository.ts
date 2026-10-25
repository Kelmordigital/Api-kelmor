import { eq, and, ne, inArray } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { ConflictError } from '../../core/errors/http-errors';
import { isUniqueViolation } from '../../core/database/pg-errors';
import { users, refreshTokens } from '../auth/auth.schema';
import { profiles } from '../profiles/profile.db.schema';
import { queues, connections, userQueues, userConnections } from '../atendimento/atendimento.db.schema';
import { userAvatars } from '../meu-perfil/meu-perfil.db.schema';

export const EMAIL_TAKEN_MESSAGE = 'E-mail já cadastrado';

export interface CompanyUser {
    id: string;
    name: string;
    nickname: string | null;
    email: string;
    profile_id: number;
    profile_tag: string;
    profile_name: string;
    is_approved: boolean;
    created_at: Date | null;
    avatar_url: string | null;
    queue_ids: number[];
    connection_ids: number[];
}

/** Usuário como pode sair na API: sem hash de senha nem segredos de 2FA. */
export type PublicUser = Omit<typeof users.$inferSelect, 'password_hash' | 'totp_secret' | 'totp_recovery_codes'>;

export interface NewUserData {
    name: string;
    email: string;
    password_hash: string;
    profile_id: number;
}

export interface UserPatch {
    name?: string;
    email?: string;
    password_hash?: string;
    profile_id?: number;
}

export interface Assignments {
    queueIds?: number[];
    connectionIds?: number[];
}

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export interface UserRepository {
    listByCompany(companyId: string): Promise<CompanyUser[]>;
    findInCompany(id: string, companyId: string): Promise<{ id: string; profile_id: number } | null>;
    isEmailTaken(email: string, exceptUserId?: string): Promise<boolean>;
    profileById(id: number): Promise<{ id: number; tag: string } | null>;
    profileByTag(tag: string): Promise<{ id: number; tag: string } | null>;
    /** Cria o usuário (aprovado) e as filas/conexões dele numa transação. Lança ConflictError para e-mail repetido. */
    create(companyId: string, data: NewUserData, assignments: Assignments): Promise<PublicUser & { queue_ids: number[]; connection_ids: number[] }>;
    /** Altera dados e substitui filas/conexões enviadas numa transação. Lança ConflictError para e-mail repetido. */
    update(id: string, companyId: string, patch: UserPatch, assignments: Assignments): Promise<void>;
    delete(id: string, companyId: string): Promise<boolean>;
    deleteRefreshTokens(userId: string): Promise<void>;
    listQueues(companyId: string): Promise<{ id: number; name: string; color: string | null }[]>;
    listConnections(companyId: string): Promise<{ id: number; name: string; status: string | null }[]>;
}

export class DrizzleUserRepository implements UserRepository {
    constructor(private readonly db: DB) {}

    async listByCompany(companyId: string): Promise<CompanyUser[]> {
        const list = await this.db
            .select({
                id: users.id, name: users.name, nickname: users.nickname, email: users.email,
                profile_id: users.profile_id, profile_tag: profiles.tag, profile_name: profiles.name,
                is_approved: users.is_approved, created_at: users.created_at, avatar_url: userAvatars.url,
            })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .leftJoin(userAvatars, eq(userAvatars.user_id, users.id))
            .where(eq(users.company_id, companyId));
        if (list.length === 0) return [];

        const ids = list.map((u) => u.id);
        const [queueRows, connectionRows] = await Promise.all([
            this.db.select().from(userQueues).where(inArray(userQueues.user_id, ids)),
            this.db.select().from(userConnections).where(inArray(userConnections.user_id, ids)),
        ]);
        return list.map((u) => ({
            ...u,
            queue_ids: queueRows.filter((q) => q.user_id === u.id).map((q) => q.queue_id),
            connection_ids: connectionRows.filter((c) => c.user_id === u.id).map((c) => c.connection_id),
        }));
    }

    async findInCompany(id: string, companyId: string) {
        const [row] = await this.db.select({ id: users.id, profile_id: users.profile_id }).from(users)
            .where(and(eq(users.id, id), eq(users.company_id, companyId))).limit(1);
        return row ?? null;
    }

    async isEmailTaken(email: string, exceptUserId?: string): Promise<boolean> {
        const conditions = [eq(users.email, email)];
        if (exceptUserId) conditions.push(ne(users.id, exceptUserId));
        const [row] = await this.db.select({ id: users.id }).from(users).where(and(...conditions)).limit(1);
        return !!row;
    }

    async profileById(id: number) {
        const [row] = await this.db.select({ id: profiles.id, tag: profiles.tag }).from(profiles).where(eq(profiles.id, id));
        return row ?? null;
    }

    async profileByTag(tag: string) {
        const [row] = await this.db.select({ id: profiles.id, tag: profiles.tag }).from(profiles).where(eq(profiles.tag, tag));
        return row ?? null;
    }

    create(companyId: string, data: NewUserData, assignments: Assignments) {
        return this.uniqueEmail(() => this.db.transaction(async (tx) => {
            const [user] = await tx.insert(users)
                .values({ ...data, company_id: companyId, is_approved: true, email_verified: true })
                .returning();
            const saved = await this.replaceAssignments(tx, user.id, companyId, assignments);
            const { password_hash: _h, totp_secret: _s, totp_recovery_codes: _r, ...publicUser } = user;
            return { ...publicUser, queue_ids: saved.queueIds ?? [], connection_ids: saved.connectionIds ?? [] };
        }));
    }

    update(id: string, companyId: string, patch: UserPatch, assignments: Assignments): Promise<void> {
        return this.uniqueEmail(() => this.db.transaction(async (tx) => {
            if (Object.keys(patch).length > 0) {
                await tx.update(users).set({ ...patch, updated_at: new Date() })
                    .where(and(eq(users.id, id), eq(users.company_id, companyId)));
            }
            await this.replaceAssignments(tx, id, companyId, assignments);
        }));
    }

    async delete(id: string, companyId: string): Promise<boolean> {
        const [row] = await this.db.delete(users)
            .where(and(eq(users.id, id), eq(users.company_id, companyId)))
            .returning({ id: users.id });
        return !!row;
    }

    async deleteRefreshTokens(userId: string): Promise<void> {
        await this.db.delete(refreshTokens).where(eq(refreshTokens.user_id, userId));
    }

    async listQueues(companyId: string): Promise<{ id: number; name: string; color: string | null }[]> {
        return this.db.select({ id: queues.id, name: queues.name, color: queues.color }).from(queues)
            .where(eq(queues.company_id, companyId));
    }

    async listConnections(companyId: string): Promise<{ id: number; name: string; status: string | null }[]> {
        return this.db.select({ id: connections.id, name: connections.name, status: connections.status }).from(connections)
            .where(eq(connections.company_id, companyId));
    }

    /**
     * Substitui as associações enviadas, só com filas/conexões da empresa —
     * sem esse filtro dava para vincular fila/conexão de outra empresa a um usuário.
     */
    private async replaceAssignments(tx: Tx, userId: string, companyId: string, { queueIds, connectionIds }: Assignments): Promise<Assignments> {
        const saved: Assignments = {};
        if (queueIds !== undefined) {
            const owned = queueIds.length === 0 ? [] : (await tx.select({ id: queues.id }).from(queues)
                .where(and(eq(queues.company_id, companyId), inArray(queues.id, queueIds)))).map((q) => q.id);
            await tx.delete(userQueues).where(eq(userQueues.user_id, userId));
            if (owned.length > 0) await tx.insert(userQueues).values(owned.map((queue_id) => ({ user_id: userId, queue_id })));
            saved.queueIds = owned;
        }
        if (connectionIds !== undefined) {
            const owned = connectionIds.length === 0 ? [] : (await tx.select({ id: connections.id }).from(connections)
                .where(and(eq(connections.company_id, companyId), inArray(connections.id, connectionIds)))).map((c) => c.id);
            await tx.delete(userConnections).where(eq(userConnections.user_id, userId));
            if (owned.length > 0) await tx.insert(userConnections).values(owned.map((connection_id) => ({ user_id: userId, connection_id })));
            saved.connectionIds = owned;
        }
        return saved;
    }

    /** Duas gravações simultâneas com o mesmo e-mail: o índice único decide. */
    private async uniqueEmail<T>(write: () => Promise<T>): Promise<T> {
        try {
            return await write();
        } catch (err) {
            if (isUniqueViolation(err)) throw new ConflictError(EMAIL_TAKEN_MESSAGE);
            throw err;
        }
    }
}
