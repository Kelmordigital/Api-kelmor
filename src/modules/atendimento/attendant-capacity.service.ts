import { eq, and, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../database/client';
import { tickets, connections } from './atendimento.db.schema';

export class AttendantLimitReachedError extends Error {
    constructor(limit?: number) {
        super(limit
            ? `Limite de ${limit} atendimentos simultâneos por atendente atingido.`
            : 'Limite de atendimentos simultâneos atingido.');
    }
}

type LimitPerms = { limit_services_users: boolean; number_limit_services_users: number | null };

/**
 * Conta tickets "Em Atendimento" (status_id=2) por atendente, excluindo os
 * presos numa conexão desconectada — o atendente não teria como agir neles
 * mesmo se quisesse, então não devem ocupar vaga do teto.
 */
export async function getActiveTicketCounts(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const rows = await db
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
export async function attendantHasCapacity(userId: string, perms: LimitPerms): Promise<boolean> {
    if (!perms.limit_services_users) return true;
    const counts = await getActiveTicketCounts([userId]);
    return (counts.get(userId) ?? 0) < (perms.number_limit_services_users ?? 5);
}

/** Filtra fora quem já bateu o teto, preservando a ordem original. */
export async function filterByCapacity(userIds: string[], perms: LimitPerms): Promise<string[]> {
    if (!perms.limit_services_users || userIds.length === 0) return userIds;
    const counts = await getActiveTicketCounts(userIds);
    const limit = perms.number_limit_services_users ?? 5;
    return userIds.filter((id) => (counts.get(id) ?? 0) < limit);
}
