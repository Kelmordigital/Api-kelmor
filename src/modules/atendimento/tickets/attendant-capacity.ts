import { eq, and, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import { tickets, connections } from '../atendimento.db.schema';

/** Arquivo-folha (só schema): as filas também usam, sem criar ciclo com o atendimento.module. */
export type LimitPerms = { limit_services_users: boolean; number_limit_services_users: number | null };

const DEFAULT_LIMIT = 5;

/** Limite de atendimentos simultâneos por atendente. */
export class AttendantCapacity {
    constructor(private readonly db: DbExecutor) {}

    /**
     * Tickets "Em Atendimento" (status 2) por atendente, sem contar os presos numa
     * conexão desconectada — o atendente não teria como agir neles.
     */
    async countActive(userIds: string[]): Promise<Map<string, number>> {
        if (userIds.length === 0) return new Map();
        const rows = await this.db
            .select({ id: tickets.attendant_user_id, total: sql<number>`count(*)::int` })
            .from(tickets)
            .leftJoin(connections, eq(tickets.connection_id, connections.id))
            .where(and(
                inArray(tickets.attendant_user_id, userIds),
                eq(tickets.status_id, 2),
                isNull(tickets.deleted_at),
                or(isNull(tickets.connection_id), eq(connections.status, 'connected')),
            ))
            .groupBy(tickets.attendant_user_id);
        const map = new Map<string, number>();
        for (const r of rows) if (r.id) map.set(r.id, r.total);
        return map;
    }

    /** Se o limite não está ativo pra empresa, todo atendente tem capacidade. */
    async hasCapacity(userId: string, perms: LimitPerms): Promise<boolean> {
        if (!perms.limit_services_users) return true;
        const counts = await this.countActive([userId]);
        return (counts.get(userId) ?? 0) < (perms.number_limit_services_users ?? DEFAULT_LIMIT);
    }

    /** Filtra fora quem já bateu o teto, preservando a ordem original. */
    async filterByCapacity(userIds: string[], perms: LimitPerms): Promise<string[]> {
        if (!perms.limit_services_users || userIds.length === 0) return userIds;
        const counts = await this.countActive(userIds);
        const limit = perms.number_limit_services_users ?? DEFAULT_LIMIT;
        return userIds.filter((id) => (counts.get(id) ?? 0) < limit);
    }
}
