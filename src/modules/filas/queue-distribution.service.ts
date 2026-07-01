import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '../../database/client';
import {
    tickets, queues, userQueues, userConnections,
} from '../atendimento/atendimento.db.schema';
import { isUserOnline } from '../../shared/socket';

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Menor contagem vence; empate → aleatório entre os empatados. */
function pickMinCount(eligible: string[], counts: Map<string, number>): string {
    let min = Infinity;
    let winners: string[] = [];
    for (const id of eligible) {
        const c = counts.get(id) ?? 0;
        if (c < min) { min = c; winners = [id]; }
        else if (c === min) winners.push(id);
    }
    return pickRandom(winners);
}

/**
 * Atribui automaticamente um ticket a um atendente elegível conforme o modo de
 * distribuição da fila. Retorna o id do atendente escolhido, ou undefined quando
 * não há distribuição automática ou nenhum atendente elegível (ticket fica pendente).
 *
 * Elegível = pertence à fila (userQueues) ∩ tem acesso à conexão (userConnections)
 *            ∩ está online no dashboard (isUserOnline).
 */
export async function distributeTicket(
    companyId: string,
    queueId: number,
    connectionId: number | null | undefined,
): Promise<string | undefined> {
    // 1. Fila válida, ativa, não-deletada e com distribuição automática
    const [queue] = await db
        .select()
        .from(queues)
        .where(and(eq(queues.id, queueId), eq(queues.company_id, companyId)))
        .limit(1);

    if (!queue || queue.deleted_at || queue.enabled === false) return undefined;
    if (queue.distribution === 'none') return undefined;
    if (connectionId == null) return undefined;

    // 2. Conjunto elegível = fila ∩ conexão ∩ online
    const [inQueue, withConn] = await Promise.all([
        db.select({ id: userQueues.user_id }).from(userQueues).where(eq(userQueues.queue_id, queueId)),
        db.select({ id: userConnections.user_id }).from(userConnections).where(eq(userConnections.connection_id, connectionId)),
    ]);
    const connSet = new Set(withConn.map((r) => r.id));
    const eligible = inQueue
        .map((r) => r.id)
        .filter((id) => connSet.has(id) && isUserOnline(id));

    if (eligible.length === 0) return undefined;
    if (eligible.length === 1) return eligible[0];

    // 3. Ranking por modo
    if (queue.distribution === 'less_attendances' || queue.distribution === 'time') {
        const statusId = queue.distribution === 'less_attendances' ? 2 : 3;
        const rows = await db
            .select({ id: tickets.attendant_user_id, total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.queue_id, queueId),
                eq(tickets.status_id, statusId),
                inArray(tickets.attendant_user_id, eligible),
            ))
            .groupBy(tickets.attendant_user_id);
        const counts = new Map<string, number>();
        for (const r of rows) if (r.id) counts.set(r.id, r.total);
        return pickMinCount(eligible, counts);
    }

    if (queue.distribution === 'attendant') {
        // Mais ocioso: quem não tem ticket na fila = prioridade máxima;
        // senão, o de atividade mais antiga (MAX(updated_at) mais antigo).
        const rows = await db
            .select({ id: tickets.attendant_user_id, last: sql<string>`max(${tickets.updated_at})` })
            .from(tickets)
            .where(and(
                eq(tickets.queue_id, queueId),
                inArray(tickets.attendant_user_id, eligible),
            ))
            .groupBy(tickets.attendant_user_id);
        const lastActivity = new Map<string, number>();
        for (const r of rows) if (r.id && r.last) lastActivity.set(r.id, new Date(r.last).getTime());

        const zeroTicket = eligible.filter((id) => !lastActivity.has(id));
        if (zeroTicket.length) return pickRandom(zeroTicket);

        let oldest = Infinity;
        let winners: string[] = [];
        for (const id of eligible) {
            const t = lastActivity.get(id) ?? Infinity;
            if (t < oldest) { oldest = t; winners = [id]; }
            else if (t === oldest) winners.push(id);
        }
        return pickRandom(winners);
    }

    return undefined;
}
