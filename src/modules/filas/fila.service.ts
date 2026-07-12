import { eq, and, ilike, isNull, sql, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import { queues, userQueues, userConnections, connectionQueues, tickets, Queue } from '../atendimento/atendimento.db.schema';
import { bots, bot_nodes } from '../bots/bots.db.schema';
import { users } from '../auth/auth.schema';
import { isUserOnline } from '../../shared/socket';
import { getCompanyPermissions } from '../configuracao-geral/configuracao-geral.service';

const VALID_DISTRIBUTION = ['none', 'less_attendances', 'time', 'attendant'];

export class FilaVinculadaChatbotError extends Error {
    constructor() { super('Não é possível excluir a fila, pois ela está vinculada a um chatbot.'); }
}

export const filaService = {

    async list(companyId: string): Promise<Queue[]> {
        return db
            .select()
            .from(queues)
            .where(and(eq(queues.company_id, companyId), isNull(queues.deleted_at)));
    },

    /** Lista paginada com busca por nome. */
    async listAll(companyId: string, params: { page?: number; perPage?: number; search?: string } = {}) {
        const page = params.page ?? 1;
        const perPage = params.perPage ?? 20;
        const offset = (page - 1) * perPage;

        const conditions = [eq(queues.company_id, companyId), isNull(queues.deleted_at)];
        if (params.search?.trim()) conditions.push(ilike(queues.name, `%${params.search.trim()}%`));
        const where = and(...conditions);

        const [rows, countRows] = await Promise.all([
            db.select().from(queues).where(where).orderBy(queues.name).limit(perPage).offset(offset),
            db.select({ count: sql<number>`count(*)::int` }).from(queues).where(where),
        ]);
        const count = countRows[0]?.count ?? 0;
        return { queues: rows, count, page, totalPages: Math.max(1, Math.ceil(count / perPage)) };
    },

    /** Filas às quais o usuário está vinculado. */
    async listUserQueues(companyId: string, userId: string): Promise<Queue[]> {
        return db
            .select({
                id: queues.id, company_id: queues.company_id, name: queues.name,
                color: queues.color, enabled: queues.enabled, greeting_message: queues.greeting_message,
                distribution: queues.distribution, deleted_at: queues.deleted_at,
            })
            .from(queues)
            .innerJoin(userQueues, eq(userQueues.queue_id, queues.id))
            .where(and(
                eq(queues.company_id, companyId),
                eq(userQueues.user_id, userId),
                isNull(queues.deleted_at),
            ))
            .orderBy(queues.name);
    },

    /** Apenas filas ativas (para seletores). */
    async listActive(companyId: string): Promise<Queue[]> {
        return db
            .select()
            .from(queues)
            .where(and(
                eq(queues.company_id, companyId),
                eq(queues.enabled, true),
                isNull(queues.deleted_at),
            ))
            .orderBy(queues.name);
    },

    /** Filas ativas vinculadas a uma conexão (usado no roteamento automático de ticket novo). */
    async findActiveQueuesByConnection(connectionId: number): Promise<Queue[]> {
        return db
            .select({
                id: queues.id, company_id: queues.company_id, name: queues.name,
                color: queues.color, enabled: queues.enabled, greeting_message: queues.greeting_message,
                distribution: queues.distribution, deleted_at: queues.deleted_at,
            })
            .from(queues)
            .innerJoin(connectionQueues, eq(connectionQueues.queue_id, queues.id))
            .where(and(
                eq(connectionQueues.connection_id, connectionId),
                eq(queues.enabled, true),
                isNull(queues.deleted_at),
            ));
    },

    async findById(id: number, companyId: string): Promise<Queue | null> {
        const [row] = await db
            .select()
            .from(queues)
            .where(and(eq(queues.id, id), eq(queues.company_id, companyId), isNull(queues.deleted_at)))
            .limit(1);
        return row ?? null;
    },

    /**
     * Atendentes elegíveis para atender/transferir nesta fila usando esta conexão:
     * pertencem à fila E têm acesso à conexão. Se connectionId for 0/ausente
     * (ticket sem connection_id), a elegibilidade considera só a fila.
     * Se transfer_online_users estiver ligado na empresa, filtra também por quem está online.
     */
    async eligibleUsers(companyId: string, queueId: number, connectionId: number) {
        const [inQueue, withConn, perms] = await Promise.all([
            db.select({ id: userQueues.user_id }).from(userQueues).where(eq(userQueues.queue_id, queueId)),
            connectionId
                ? db.select({ id: userConnections.user_id }).from(userConnections).where(eq(userConnections.connection_id, connectionId))
                : Promise.resolve(null),
            getCompanyPermissions(companyId),
        ]);
        let ids = inQueue.map((r) => r.id);
        if (withConn) {
            const connSet = new Set(withConn.map((r) => r.id));
            ids = ids.filter((id) => connSet.has(id));
        }
        if (perms.transfer_online_users) ids = ids.filter((id) => isUserOnline(id));
        if (ids.length === 0) return [];

        return db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(and(eq(users.company_id, companyId), inArray(users.id, ids)))
            .orderBy(users.name);
    },

    async create(companyId: string, payload: {
        name: string;
        color?: string | null;
        greeting_message?: string | null;
        enabled?: boolean;
        distribution?: string;
    }): Promise<Queue> {
        const distribution = VALID_DISTRIBUTION.includes(payload.distribution ?? 'none')
            ? (payload.distribution ?? 'none') : 'none';
        const [row] = await db
            .insert(queues)
            .values({ company_id: companyId, ...payload, distribution })
            .returning();
        return row;
    },

    async update(id: number, companyId: string, payload: {
        name?: string;
        color?: string | null;
        greeting_message?: string | null;
        enabled?: boolean;
        distribution?: string;
    }): Promise<Queue | null> {
        if (payload.distribution !== undefined && !VALID_DISTRIBUTION.includes(payload.distribution)) {
            delete payload.distribution;
        }
        const [row] = await db
            .update(queues)
            .set(payload)
            .where(and(eq(queues.id, id), eq(queues.company_id, companyId), isNull(queues.deleted_at)))
            .returning();
        if (!row) return null;

        // Ao desativar: remove a fila dos tickets ainda pendentes (status 1)
        if (payload.enabled === false) {
            await db.update(tickets)
                .set({ queue_id: null })
                .where(and(eq(tickets.company_id, companyId), eq(tickets.queue_id, id), eq(tickets.status_id, 1)));
        }
        return row;
    },

    /** Soft delete. Bloqueia se a fila estiver vinculada a um bot ativo. */
    async remove(id: number, companyId: string): Promise<boolean> {
        const existing = await this.findById(id, companyId);
        if (!existing) return false;

        // Proteção: fila referenciada por nó de transferência de bot ativo
        const [linked] = await db
            .select({ id: bot_nodes.id })
            .from(bot_nodes)
            .innerJoin(bots, eq(bots.id, bot_nodes.bot_id))
            .where(and(
                eq(bot_nodes.queue_id, id),
                eq(bots.company_id, companyId),
                eq(bots.active, true),
                isNull(bots.deleted_at),
            ))
            .limit(1);
        if (linked) throw new FilaVinculadaChatbotError();

        // Soft delete + desvincula tickets (coluna solta, sem cascade)
        await db.update(queues)
            .set({ deleted_at: new Date() })
            .where(and(eq(queues.id, id), eq(queues.company_id, companyId)));
        await db.update(tickets)
            .set({ queue_id: null })
            .where(and(eq(tickets.company_id, companyId), eq(tickets.queue_id, id)));
        return true;
    },
};
