import { and, eq, getTableColumns, ilike, inArray, isNull, sql } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { containsPattern } from '../../core/database/like-pattern';
import type { Pagination } from '../../core/http/pagination';
import {
    connectionQueues, queues, tickets, userConnections, userQueues, type Queue,
} from '../atendimento/atendimento.db.schema';
import { bots, bot_nodes } from '../bots/bots.db.schema';
import { users } from '../auth/auth.schema';
import type { CreateFilaInput, UpdateFilaInput } from './fila.dto';

export interface EligibleUser {
    id: string;
    name: string;
    nickname: string | null;
    email: string;
}

export interface QueueRepository {
    list(companyId: string): Promise<Queue[]>;
    search(companyId: string, pagination: Pagination, term?: string): Promise<{ rows: Queue[]; count: number }>;
    listForUser(companyId: string, userId: string): Promise<Queue[]>;
    listActive(companyId: string): Promise<Queue[]>;
    /** Filas ativas oferecidas por uma conexão. */
    listActiveByConnection(connectionId: number): Promise<Queue[]>;
    findById(id: number, companyId: string): Promise<Queue | null>;
    create(companyId: string, input: CreateFilaInput): Promise<Queue>;
    update(id: number, companyId: string, input: UpdateFilaInput): Promise<Queue | null>;
    /** Tira a fila dos tickets ainda pendentes (aguardando atendente). */
    detachPendingTickets(id: number, companyId: string): Promise<void>;
    isUsedByActiveBot(id: number, companyId: string): Promise<boolean>;
    /** Exclusão lógica + desvincula todos os tickets da fila, juntos. */
    softDelete(id: number, companyId: string): Promise<void>;
    /** Usuários da empresa que estão na fila (e na conexão, se informada). */
    membersOf(companyId: string, queueId: number, connectionId: number | null): Promise<string[]>;
    usersByIds(companyId: string, ids: string[]): Promise<EligibleUser[]>;
}

const queueColumns = getTableColumns(queues);

export class DrizzleQueueRepository implements QueueRepository {
    constructor(private readonly db: DB) {}

    list(companyId: string): Promise<Queue[]> {
        return this.db.select().from(queues).where(this.ofCompany(companyId));
    }

    async search(companyId: string, pagination: Pagination, term?: string) {
        const where = term?.trim()
            ? and(this.ofCompany(companyId), ilike(queues.name, containsPattern(term.trim())))
            : this.ofCompany(companyId);
        const [rows, [counted]] = await Promise.all([
            this.db.select().from(queues).where(where).orderBy(queues.name).limit(pagination.limit).offset(pagination.offset),
            this.db.select({ count: sql<number>`count(*)::int` }).from(queues).where(where),
        ]);
        return { rows, count: counted?.count ?? 0 };
    }

    listForUser(companyId: string, userId: string): Promise<Queue[]> {
        return this.db.select(queueColumns).from(queues)
            .innerJoin(userQueues, eq(userQueues.queue_id, queues.id))
            .where(and(this.ofCompany(companyId), eq(userQueues.user_id, userId)))
            .orderBy(queues.name);
    }

    listActive(companyId: string): Promise<Queue[]> {
        return this.db.select().from(queues)
            .where(and(this.ofCompany(companyId), eq(queues.enabled, true)))
            .orderBy(queues.name);
    }

    listActiveByConnection(connectionId: number): Promise<Queue[]> {
        return this.db.select(queueColumns).from(queues)
            .innerJoin(connectionQueues, eq(connectionQueues.queue_id, queues.id))
            .where(and(eq(connectionQueues.connection_id, connectionId), eq(queues.enabled, true), isNull(queues.deleted_at)));
    }

    async findById(id: number, companyId: string) {
        const [row] = await this.db.select().from(queues).where(and(eq(queues.id, id), this.ofCompany(companyId))).limit(1);
        return row ?? null;
    }

    async create(companyId: string, input: CreateFilaInput) {
        const [row] = await this.db.insert(queues).values({ ...input, company_id: companyId }).returning();
        return row;
    }

    async update(id: number, companyId: string, input: UpdateFilaInput) {
        if (Object.keys(input).length === 0) return this.findById(id, companyId);
        const [row] = await this.db.update(queues).set(input)
            .where(and(eq(queues.id, id), this.ofCompany(companyId)))
            .returning();
        return row ?? null;
    }

    async detachPendingTickets(id: number, companyId: string) {
        await this.db.update(tickets).set({ queue_id: null })
            .where(and(eq(tickets.company_id, companyId), eq(tickets.queue_id, id), eq(tickets.status_id, 1)));
    }

    async isUsedByActiveBot(id: number, companyId: string) {
        const [linked] = await this.db.select({ id: bot_nodes.id }).from(bot_nodes)
            .innerJoin(bots, eq(bots.id, bot_nodes.bot_id))
            .where(and(eq(bot_nodes.queue_id, id), eq(bots.company_id, companyId), eq(bots.active, true), isNull(bots.deleted_at)))
            .limit(1);
        return Boolean(linked);
    }

    async softDelete(id: number, companyId: string) {
        await this.db.transaction(async (tx) => {
            await tx.update(queues).set({ deleted_at: new Date() })
                .where(and(eq(queues.id, id), eq(queues.company_id, companyId)));
            await tx.update(tickets).set({ queue_id: null })
                .where(and(eq(tickets.company_id, companyId), eq(tickets.queue_id, id)));
        });
    }

    async membersOf(companyId: string, queueId: number, connectionId: number | null) {
        // userQueues/userConnections não têm company_id: o join em users garante a empresa
        const inQueue = this.db.select({ id: userQueues.user_id }).from(userQueues)
            .innerJoin(users, eq(users.id, userQueues.user_id))
            .where(and(eq(userQueues.queue_id, queueId), eq(users.company_id, companyId)));
        if (connectionId === null) return (await inQueue).map((r) => r.id);

        const withConnection = this.db.select({ id: userConnections.user_id }).from(userConnections)
            .where(eq(userConnections.connection_id, connectionId));
        const [queued, connected] = await Promise.all([inQueue, withConnection]);
        const allowed = new Set(connected.map((r) => r.id));
        return queued.map((r) => r.id).filter((id) => allowed.has(id));
    }

    async usersByIds(companyId: string, ids: string[]) {
        if (ids.length === 0) return [];
        return this.db.select({ id: users.id, name: users.name, nickname: users.nickname, email: users.email })
            .from(users)
            .where(and(eq(users.company_id, companyId), inArray(users.id, ids)))
            .orderBy(users.name);
    }

    private ofCompany(companyId: string) {
        return and(eq(queues.company_id, companyId), isNull(queues.deleted_at));
    }
}

/** Números que a distribuição automática usa para escolher o atendente. */
export interface DistributionStats {
    /** Tickets da fila por atendente num status (2 = em atendimento, 3 = finalizado). */
    ticketCounts(queueId: number, statusId: number, userIds: string[]): Promise<Map<string, number>>;
    /** Última atividade (updated_at mais recente) de cada atendente em tickets da fila. */
    lastActivity(queueId: number, userIds: string[]): Promise<Map<string, number>>;
}

export class DrizzleDistributionStats implements DistributionStats {
    constructor(private readonly db: DB) {}

    async ticketCounts(queueId: number, statusId: number, userIds: string[]) {
        const rows = await this.db
            .select({ id: tickets.attendant_user_id, total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(eq(tickets.queue_id, queueId), eq(tickets.status_id, statusId), inArray(tickets.attendant_user_id, userIds)))
            .groupBy(tickets.attendant_user_id);
        return new Map(rows.filter((r) => r.id).map((r) => [r.id!, r.total]));
    }

    async lastActivity(queueId: number, userIds: string[]) {
        const rows = await this.db
            .select({ id: tickets.attendant_user_id, last: sql<string>`max(${tickets.updated_at})` })
            .from(tickets)
            .where(and(eq(tickets.queue_id, queueId), inArray(tickets.attendant_user_id, userIds)))
            .groupBy(tickets.attendant_user_id);
        return new Map(rows.filter((r) => r.id && r.last).map((r) => [r.id!, new Date(r.last).getTime()]));
    }
}
