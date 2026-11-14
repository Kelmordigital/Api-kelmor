import { and, asc, count, desc, eq, gte, isNotNull, isNull, lte, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../../database/client';
import type { Pagination } from '../../core/http/pagination';
import { users } from '../auth/auth.schema';
import { contacts, tickets } from '../atendimento/atendimento.db.schema';
import { BR_TIME_ZONE } from '../../core/dates/br-day';

/** Dia (no calendário de Brasília) da criação do ticket — `t.created_at` e `created_at` da CTE. */
const BR_DAY_T = sql.raw(`(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${BR_TIME_ZONE}')::date`);
const BR_DAY = sql.raw(`(created_at AT TIME ZONE 'UTC' AT TIME ZONE '${BR_TIME_ZONE}')::date`);
const BR_TODAY = sql.raw(`(now() AT TIME ZONE '${BR_TIME_ZONE}')::date`);

/** Intervalo de datas já resolvido; `from`/`to` ausentes = sem limite daquele lado. */
export interface Period {
    from?: Date;
    to?: Date;
}

export interface UserTicketsRow { id: string; name: string; total_tickets: number }
export interface ClientTicketsRow { client: string; number: string | null; ticket_count: number }

export interface AverageFilter {
    /** Dias (AAAA-MM-DD) de criação do ticket; ignorados quando `lastDays` vem. */
    dateInit?: string;
    dateEnd?: string;
    /** Só os últimos N dias (gráfico). */
    lastDays?: number;
    queueId?: number;
    userId?: string;
    connectionId?: number;
}

export interface AverageRow {
    day: string;
    time_opened: number;
    label_opened: string;
    time_closed: number;
    label_closed: string;
}

/** Consultas dos relatórios de atendimento. */
export interface ReportsRepository {
    ticketsByUser(companyId: string, period: Period): Promise<UserTicketsRow[]>;
    /** `pagination` ausente = todos os clientes. */
    ticketsByClient(companyId: string, period: Period, pagination?: Pagination): Promise<{ items: ClientTicketsRow[]; count: number }>;
    /** `pagination` ausente = todos os dias. */
    averageTimes(companyId: string, filter: AverageFilter, retentionDays: number, pagination?: Pagination): Promise<AverageRow[]>;
}

export class DrizzleReportsRepository implements ReportsRepository {
    constructor(private readonly db: DB) {}

    /** RN-REL-02: todos os usuários da empresa, inclusive quem não finalizou nada. */
    ticketsByUser(companyId: string, period: Period): Promise<UserTicketsRow[]> {
        const closedByUser = [
            eq(tickets.closed_by_user_id, users.id),
            eq(tickets.status_id, 3),
            isNotNull(tickets.closed_by_user_id),
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            ...this.period(period),
        ];
        return this.db
            .select({ id: users.id, name: users.name, total_tickets: count(tickets.id) })
            .from(users)
            .leftJoin(tickets, and(...closedByUser))
            .where(eq(users.company_id, companyId))
            .groupBy(users.id, users.name)
            .orderBy(asc(users.name));
    }

    /** RN-REL-03: agrupa por contato (homônimos ficam separados). */
    async ticketsByClient(companyId: string, period: Period, pagination?: Pagination) {
        const where = and(eq(tickets.company_id, companyId), isNull(tickets.deleted_at), ...this.period(period));
        const ticketCount = count(tickets.id);
        const page = this.db
            .select({ client: contacts.name, number: contacts.number, ticket_count: ticketCount })
            .from(tickets)
            .innerJoin(contacts, eq(tickets.contact_id, contacts.id))
            .where(where)
            .groupBy(contacts.id, contacts.name, contacts.number)
            .orderBy(desc(ticketCount), asc(contacts.name), asc(contacts.id));

        const [items, [counted]] = await Promise.all([
            pagination ? page.limit(pagination.limit).offset(pagination.offset) : page,
            this.db.select({ total: sql<number>`cast(count(distinct ${tickets.contact_id}) as int)` }).from(tickets).where(where),
        ]);
        return { items, count: counted?.total ?? 0 };
    }

    /**
     * RN-REL-04: por ticket, o primeiro atendimento (vindo da fila, do bot ou
     * pendente — não transferência nem reabertura) e o primeiro encerramento
     * (finalizado ou enviado à pesquisa); depois, a média por dia de criação.
     */
    async averageTimes(companyId: string, f: AverageFilter, retentionDays: number, pagination?: Pagination): Promise<AverageRow[]> {
        const filters: SQL[] = [];
        if (f.lastDays) {
            filters.push(sql`AND ${BR_DAY_T} >= ${BR_TODAY} - ${f.lastDays - 1}::int`);
        } else {
            if (f.dateInit) filters.push(sql`AND ${BR_DAY_T} >= ${f.dateInit}::date`);
            if (f.dateEnd)  filters.push(sql`AND ${BR_DAY_T} <= ${f.dateEnd}::date`);
        }
        if (f.queueId)      filters.push(sql`AND t.queue_id = ${f.queueId}`);
        if (f.userId)       filters.push(sql`AND t.attendant_user_id = ${f.userId}`);
        if (f.connectionId) filters.push(sql`AND t.connection_id = ${f.connectionId}`);
        const page = pagination ? sql`LIMIT ${pagination.limit} OFFSET ${pagination.offset}` : sql``;

        const rows = await this.db.execute<{ day: string; opened: string | number; closed: string | number }>(sql`
            WITH per_ticket AS (
                SELECT
                    t.created_at,
                    MIN(ht.created_at) FILTER (
                        WHERE ht.status_id_end = 2 AND COALESCE(ht.status_id_init, 0) NOT IN (2, 3, 7)
                    ) AS accepted_at,
                    MIN(ht.created_at) FILTER (WHERE ht.status_id_end IN (3, 7)) AS closed_at
                FROM at_tickets t
                INNER JOIN at_historic_tickets ht ON ht.ticket_id = t.id AND ht.status_id_end IN (2, 3, 7)
                WHERE t.company_id = ${companyId}
                  AND t.deleted_at IS NULL
                  AND t.created_at >= NOW() - make_interval(days => ${retentionDays}::int)
                  ${sql.join(filters, sql` `)}
                GROUP BY t.id, t.created_at
            )
            SELECT
                TO_CHAR(${BR_DAY}, 'DD/MM/YYYY') AS day,
                COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)))), 0) AS opened,
                COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)))), 0) AS closed
            FROM per_ticket
            GROUP BY ${BR_DAY}
            ORDER BY ${BR_DAY} ASC
            ${page}
        `);

        return (rows as unknown as { day: string; opened: string | number; closed: string | number }[]).map((r) => {
            const opened = Number(r.opened);
            const closed = Number(r.closed);
            return {
                day: r.day,
                time_opened: opened * 1000,
                label_opened: DrizzleReportsRepository.clock(opened),
                time_closed: closed * 1000,
                label_closed: DrizzleReportsRepository.clock(closed),
            };
        });
    }

    private period(p: Period): SQL[] {
        const conditions: SQL[] = [];
        if (p.from) conditions.push(gte(tickets.updated_at, p.from));
        if (p.to) conditions.push(lte(tickets.updated_at, p.to));
        return conditions;
    }

    /** Segundos em HH:MM:SS (horas passam de 24 quando preciso). */
    private static clock(seconds: number): string {
        const two = (n: number) => String(n).padStart(2, '0');
        return `${two(Math.floor(seconds / 3600))}:${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`;
    }
}
