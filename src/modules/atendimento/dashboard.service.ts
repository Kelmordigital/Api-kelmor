import { sql, and, or, eq, isNull, gte, lte, desc, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import {
    tickets, connections, crm_sales_reasons, contacts, atendimento_messages,
} from './atendimento.db.schema';
import { users } from '../auth/auth.schema';
import { companies } from '../companies/company.db.schema';
import { profiles } from '../profiles/profile.db.schema';
import { agendamentos } from '../agenda/agenda.db.schema';
import { brCalendar, brLocal, brMidnight, endOfDayBR, startOfDayBR } from '../../core/dates/br-day';

export type Period = 'day' | 'week' | 'month' | 'year';

const VALID_PERIODS: Period[] = ['day', 'week', 'month', 'year'];
export function parsePeriod(raw: unknown): Period {
    return VALID_PERIODS.includes(raw as Period) ? (raw as Period) : 'week';
}

export class DateRangeTooLargeError extends Error {
    constructor() { super('O intervalo de datas selecionado é maior que 45 dias.'); }
}

const MAX_DATE_RANGE_DAYS = 45;

/** Escopo completo de um pedido de dashboard: período (preset OU datas exatas) + conexão/fila/atendente. */
export interface DashboardScope {
    period: Period;
    startDate?: string; // 'YYYY-MM-DD', mutuamente exclusivo com period
    endDate?: string;
    connectionId?: number;
    queueId?: number;
    attendantId?: string;
}

/** Lê e valida os parâmetros de filtro comuns a todos os endpoints de dashboard. */
export function parseDashboardFilter(query: Record<string, unknown>): Omit<DashboardScope, 'attendantId'> & { attendantUserId?: string } {
    const period = parsePeriod(query.period);
    const startDate = typeof query.startDate === 'string' && query.startDate ? query.startDate : undefined;
    const endDate    = typeof query.endDate   === 'string' && query.endDate   ? query.endDate   : undefined;

    if (startDate && endDate) {
        const days = (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86_400_000;
        if (days < 0 || days > MAX_DATE_RANGE_DAYS) throw new DateRangeTooLargeError();
    }

    const connectionId = query.connectionId ? Number(query.connectionId) : undefined;
    const queueId       = query.queueId      ? Number(query.queueId)      : undefined;
    const attendantUserId = typeof query.attendantUserId === 'string' && query.attendantUserId ? query.attendantUserId : undefined;

    return {
        period,
        startDate,
        endDate,
        connectionId: connectionId && !Number.isNaN(connectionId) ? connectionId : undefined,
        queueId: queueId && !Number.isNaN(queueId) ? queueId : undefined,
        attendantUserId,
    };
}

/** Condições extras (conexão/fila/atendente) compartilhadas por todas as queries de dashboard. */
function scopeConditions(scope: DashboardScope) {
    return [
        scope.attendantId  ? eq(tickets.attendant_user_id, scope.attendantId) : undefined,
        scope.connectionId ? eq(tickets.connection_id, scope.connectionId)    : undefined,
        scope.queueId      ? eq(tickets.queue_id, scope.queueId)              : undefined,
    ];
}

/** Resolve o intervalo real: datas exatas (quando presentes) têm prioridade sobre o preset de período. */
function resolveInterval(scope: DashboardScope) {
    if (scope.startDate && scope.endDate) {
        return {
            start: startOfDayBR(scope.startDate),
            end:   endOfDayBR(scope.endDate),
        };
    }
    return getInterval(scope.period);
}

// ── Consultas do desempenho da equipe (uma por indicador; teamPerformance só monta o resultado) ──

/** Atendentes (perfil 'user') da empresa; se o filtro trouxe um atendente, só ele. */
async function teamMembers(companyId: string, scope: DashboardScope) {
    return db
        .select({ id: users.id, name: users.name })
        .from(users)
        .innerJoin(profiles, eq(profiles.id, users.profile_id))
        .where(and(
            eq(users.company_id, companyId),
            eq(profiles.tag, 'user'),
            scope.attendantId ? eq(users.id, scope.attendantId) : undefined,
        ));
}

/** Quantidade de atendimentos e tempo médio (criação→fechamento, só fechados) por atendente. */
async function ticketStatsByAttendant(companyId: string, scope: DashboardScope) {
    const { start, end } = resolveInterval(scope);
    const rows = await db
        .select({
            userId: tickets.attendant_user_id,
            total:  sql<number>`count(*)::int`,
            avgSeconds: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${tickets.updated_at} - ${tickets.created_at}))) FILTER (WHERE ${tickets.status_id} = 3), 0)::float`,
        })
        .from(tickets)
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            gte(tickets.updated_at, start),
            lte(tickets.updated_at, end),
            ...scopeConditions(scope),
        ))
        .groupBy(tickets.attendant_user_id);
    return new Map(rows.map(r => [r.userId, r]));
}

/** Valor vendido por atendente — mesma regra de venda concluída usada em salesByChannel. */
async function salesValueByAttendant(companyId: string, scope: DashboardScope) {
    const { start, end } = resolveInterval(scope);
    const rows = await db
        .select({
            userId: tickets.attendant_user_id,
            total:  sql<number>`COALESCE(SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)::float`,
        })
        .from(tickets)
        .where(and(
            eq(tickets.company_id, companyId),
            eq(tickets.is_sale, 1),
            eq(tickets.status_id, 3),
            eq(tickets.service_not_made, 0),
            isNull(tickets.deleted_at),
            gte(tickets.updated_at, start),
            lte(tickets.updated_at, end),
            ...scopeConditions(scope),
        ))
        .groupBy(tickets.attendant_user_id);
    return new Map(rows.map(r => [r.userId, r.total]));
}

/** Agendamentos criados no período por usuário (a agenda não tem conexão/fila, então esses filtros não se aplicam). */
async function appointmentsByCreator(companyId: string, scope: DashboardScope) {
    const { start, end } = resolveInterval(scope);
    const rows = await db
        .select({
            userId: agendamentos.created_by,
            total:  sql<number>`count(*)::int`,
        })
        .from(agendamentos)
        .where(and(
            eq(agendamentos.company_id, companyId),
            gte(agendamentos.created_at, start),
            lte(agendamentos.created_at, end),
        ))
        .groupBy(agendamentos.created_by);
    return new Map(rows.map(r => [r.userId, r.total]));
}

const TICKET_STATUS: Record<number, { name: string; color: string }> = {
    1: { name: 'Na Fila',        color: '#f97316' },
    2: { name: 'Em Atendimento', color: '#6366f1' },
    3: { name: 'Resolvido',      color: '#22c55e' },
};

/** Período (hoje / esta semana / este mês / este ano) no calendário de Brasília. */
export function getInterval(period: Period, now: Date = new Date()) {
    const { year, month, day, weekday } = brCalendar(now);
    const lastMsBefore = (d: Date) => new Date(d.getTime() - 1);
    let start: Date;
    let end: Date;
    switch (period) {
        case 'day':
            start = brMidnight(year, month, day);
            end   = lastMsBefore(brMidnight(year, month, day + 1));
            break;
        case 'week': {
            const diff = weekday === 0 ? -6 : 1 - weekday; // semana de segunda a domingo
            start = brMidnight(year, month, day + diff);
            end   = lastMsBefore(brMidnight(year, month, day + diff + 7));
            break;
        }
        case 'month':
            start = brMidnight(year, month, 1);
            end   = lastMsBefore(brMidnight(year, month + 1, 1));
            break;
        case 'year':
            start = brMidnight(year, 0, 1);
            end   = lastMsBefore(brMidnight(year + 1, 0, 1));
            break;
    }
    return { start, end };
}

export const dashboardService = {

    async salesByConnection(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                label: sql<string>`coalesce(${connections.name}, 'Sem conexão')`,
                total: sql<number>`count(*)::int`,
                totalEmVendas: sql<number>`COALESCE(SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)`,
            })
            .from(tickets)
            .leftJoin(connections, eq(connections.id, tickets.connection_id))
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.is_sale, 1),
                eq(tickets.status_id, 3),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(connections.id, connections.name)
            .orderBy(sql`count(*) desc`);
    },

    async notSalesByConnection(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                label: sql<string>`coalesce(${connections.name}, 'Sem conexão')`,
                total: sql<number>`count(*)::int`,
            })
            .from(tickets)
            .leftJoin(connections, eq(connections.id, tickets.connection_id))
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.is_sale, 0),
                eq(tickets.status_id, 3),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(connections.id, connections.name)
            .orderBy(sql`count(*) desc`);
    },

    async notSalesByChannel(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                label: sql<string>`COALESCE(${tickets.origin}, 'Base de contatos')`,
                total: sql<number>`count(*)::int`,
            })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.is_sale, 0),
                eq(tickets.status_id, 3),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(tickets.origin)
            .orderBy(sql`count(*) desc`);
    },

    async notSalesByReason(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                label: sql<string>`coalesce(${crm_sales_reasons.reason}, 'Sem motivo')`,
                total: sql<number>`count(*)::int`,
            })
            .from(tickets)
            .leftJoin(crm_sales_reasons, eq(crm_sales_reasons.id, tickets.reasons_id))
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.is_sale, 0),
                eq(tickets.status_id, 3),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(crm_sales_reasons.id, crm_sales_reasons.reason)
            .orderBy(sql`count(*) desc`);
    },

    /**
     * Pivotado ao longo do tempo (mesma granularidade do gráfico "Novos
     * Contatos" — hora/dia da semana/dia do mês/mês — ver getGraph) pra
     * alimentar o gráfico empilhado por motivo. `updated_at` (não
     * `created_at`) porque o que importa aqui é quando a não-venda aconteceu
     * (fechamento), igual às outras queries de not-sales desta empresa.
     */
    async notSalesByReasonOverTime(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        const period = scope.period;
        const exact = Boolean(scope.startDate && scope.endDate);

        const slotCol = exact
            ? sql<string>`DATE(${brLocal(tickets.updated_at)})::text`
            : period === 'day'   ? sql<number>`EXTRACT(HOUR FROM ${brLocal(tickets.updated_at)})::int`
            : period === 'week'  ? sql<number>`EXTRACT(ISODOW FROM ${brLocal(tickets.updated_at)})::int`
            : period === 'month' ? sql<number>`EXTRACT(DAY FROM ${brLocal(tickets.updated_at)})::int`
                                 : sql<number>`EXTRACT(MONTH FROM ${brLocal(tickets.updated_at)})::int`;

        const rows = await db
            .select({
                slot:   slotCol,
                reason: sql<string>`coalesce(${crm_sales_reasons.reason}, 'Sem motivo')`,
                total:  sql<number>`count(*)::int`,
            })
            .from(tickets)
            .leftJoin(crm_sales_reasons, eq(crm_sales_reasons.id, tickets.reasons_id))
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.is_sale, 0),
                eq(tickets.status_id, 3),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(slotCol, crm_sales_reasons.id, crm_sales_reasons.reason);

        const reasons = [...new Set(rows.map((r) => r.reason))];

        let slots: Array<{ slot: string | number; label: string }>;
        if (exact && scope.startDate && scope.endDate) {
            slots = [];
            const cursor = new Date(`${scope.startDate}T00:00:00`);
            const rangeEnd = new Date(`${scope.endDate}T00:00:00`);
            while (cursor <= rangeEnd) {
                const iso = cursor.toISOString().slice(0, 10);
                slots.push({ slot: iso, label: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` });
                cursor.setDate(cursor.getDate() + 1);
            }
        } else if (period === 'day') {
            slots = Array.from({ length: 24 }, (_, i) => ({ slot: i, label: `${i}h` }));
        } else if (period === 'week') {
            const WEEK_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
            slots = WEEK_LABELS.map((label, i) => ({ slot: i + 1, label })); // ISODOW: 1=Seg..7=Dom
        } else if (period === 'month') {
            const { year, month } = brCalendar();
            const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
            slots = Array.from({ length: daysInMonth }, (_, i) => ({ slot: i + 1, label: String(i + 1).padStart(2, '0') }));
        } else {
            const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            slots = MONTH_LABELS.map((label, i) => ({ slot: i + 1, label }));
        }

        const buckets = slots.map(({ slot, label }) => {
            const bucket: Record<string, number | string> = { slot, label, total: 0 };
            for (const name of reasons) bucket[name] = 0;
            for (const row of rows.filter((r) => r.slot === slot)) {
                bucket[row.reason] = row.total;
                (bucket.total as number) += row.total;
            }
            return bucket;
        });

        return { reasons, buckets };
    },

    async salesByChannel(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                label: sql<string>`COALESCE(${tickets.origin}, 'Base de contatos')`,
                total: sql<number>`count(*)::int`,
                totalEmVendas: sql<number>`COALESCE(SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)`,
            })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.is_sale, 1),
                eq(tickets.status_id, 3),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(tickets.origin)
            .orderBy(sql`count(*) desc`);
    },

    /** Top clientes por valor gasto no período — card "Maiores clientes" do AdminDashboard. */
    async topCustomers(companyId: string, scope: DashboardScope, limit = 5) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                contactId: tickets.contact_id,
                name: contacts.name,
                pedidos: sql<number>`count(*)::int`,
                total: sql<number>`COALESCE(SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)`,
            })
            .from(tickets)
            .innerJoin(contacts, eq(contacts.id, tickets.contact_id))
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.is_sale, 1),
                eq(tickets.status_id, 3),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(tickets.contact_id, contacts.name)
            .orderBy(sql`COALESCE(SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0) desc`)
            .limit(limit);
    },

    async listReasons(companyId: string) {
        return db.select().from(crm_sales_reasons).where(eq(crm_sales_reasons.company_id, companyId));
    },

    async createReason(companyId: string, reason: string, color?: string) {
        const [r] = await db.insert(crm_sales_reasons).values({ company_id: companyId, reason, color }).returning();
        return r;
    },

    // ────── Novos métodos de dashboard ──────

    async getKpis(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        const extra = scopeConditions(scope);

        const [newTickets] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                gte(tickets.created_at, start),
                lte(tickets.created_at, end),
                ...extra,
            ));

        const [totalAll] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                ...extra,
            ));

        const [activeNow] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                inArray(tickets.status_id, [1, 2]),
                ...extra,
            ));

        const [naFila] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                eq(tickets.status_id, 1),
                scope.connectionId ? eq(tickets.connection_id, scope.connectionId) : undefined,
                scope.queueId      ? eq(tickets.queue_id, scope.queueId)          : undefined,
            ));

        const [resolved] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                eq(tickets.status_id, 3),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...extra,
            ));

        const msgs = await db.select({
            from_me: atendimento_messages.from_me,
            total: sql<number>`count(*)::int`,
        })
        .from(atendimento_messages)
        .innerJoin(tickets, eq(tickets.id, atendimento_messages.ticket_id))
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            gte(atendimento_messages.created_at, start),
            lte(atendimento_messages.created_at, end),
            ...extra,
        ))
        .groupBy(atendimento_messages.from_me);

        const enviadas  = msgs.find(m => m.from_me === true)?.total  ?? 0;
        const recebidas = msgs.find(m => m.from_me === false)?.total ?? 0;
        const novas     = newTickets?.total ?? 0;
        const total     = totalAll?.total   ?? 0;
        const resolvidos = resolved?.total  ?? 0;

        return {
            novasConversas:       novas,
            novasConversasTotal:  total,
            conversasAtivas:      activeNow?.total ?? 0,
            enviadas,
            recebidas,
            taxaResolucao:        total > 0 ? Math.round((resolvidos / total) * 100) : 0,
            resolvidos,
            naFila:               naFila?.total ?? 0,
        };
    },

    async getGraph(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        const period = scope.period;
        // Data exata: agrupa por calendário (evita colidir "dia 20" de Jan com "dia 20" de Fev,
        // que EXTRACT(DAY) causaria num intervalo de até 45 dias cruzando meses).
        const exact = Boolean(scope.startDate && scope.endDate);

        const slotCol = exact
            ? sql<string>`DATE(${brLocal(tickets.created_at)})::text`
            : period === 'day'   ? sql<number>`EXTRACT(HOUR FROM ${brLocal(tickets.created_at)})::int`
            : period === 'week'  ? sql<number>`EXTRACT(ISODOW FROM ${brLocal(tickets.created_at)})::int`
            : period === 'month' ? sql<number>`EXTRACT(DAY FROM ${brLocal(tickets.created_at)})::int`
                                 : sql<number>`EXTRACT(MONTH FROM ${brLocal(tickets.created_at)})::int`;

        const data = await db.select({ slot: slotCol, total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                gte(tickets.created_at, start),
                lte(tickets.created_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(slotCol)
            .orderBy(slotCol);

        return { period, data };
    },

    /** Igual a getGraph, mas quebrado por status_id — alimenta o gráfico empilhado "Atendimentos por período". */
    async getGraphByStatus(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        const period = scope.period;
        const exact = Boolean(scope.startDate && scope.endDate);

        const slotCol = exact
            ? sql<string>`DATE(${brLocal(tickets.created_at)})::text`
            : period === 'day'   ? sql<number>`EXTRACT(HOUR FROM ${brLocal(tickets.created_at)})::int`
            : period === 'week'  ? sql<number>`EXTRACT(ISODOW FROM ${brLocal(tickets.created_at)})::int`
            : period === 'month' ? sql<number>`EXTRACT(DAY FROM ${brLocal(tickets.created_at)})::int`
                                 : sql<number>`EXTRACT(MONTH FROM ${brLocal(tickets.created_at)})::int`;

        const data = await db.select({
            slot:      slotCol,
            status_id: tickets.status_id,
            total:     sql<number>`count(*)::int`,
        })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                gte(tickets.created_at, start),
                lte(tickets.created_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(slotCol, tickets.status_id)
            .orderBy(slotCol);

        return { period, data };
    },

    async getMovimentos(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);

        const rows = await db.select({
            status_id: tickets.status_id,
            total:     sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            gte(tickets.updated_at, start),
            lte(tickets.updated_at, end),
            ...scopeConditions(scope),
        ))
        .groupBy(tickets.status_id);

        return rows.map(r => ({
            label: TICKET_STATUS[r.status_id]?.name  ?? `Status ${r.status_id}`,
            value: r.total,
            color: TICKET_STATUS[r.status_id]?.color ?? '#94a3b8',
        }));
    },

    async getFunnel(companyId: string, scope: Pick<DashboardScope, 'attendantId' | 'connectionId' | 'queueId'>) {
        const rows = await db.select({
            status_id: tickets.status_id,
            total:     sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            ...scopeConditions(scope as DashboardScope),
        ))
        .groupBy(tickets.status_id);

        return rows.map(r => ({
            name:  TICKET_STATUS[r.status_id]?.name  ?? `Status ${r.status_id}`,
            value: r.total,
            color: TICKET_STATUS[r.status_id]?.color ?? '#94a3b8',
        }));
    },

    async getRecent(companyId: string, limit: number, scope: Pick<DashboardScope, 'attendantId' | 'connectionId' | 'queueId'>) {
        return db.select({
            id:       tickets.id,
            nome:     contacts.name,
            telefone: contacts.number,
            data:     tickets.updated_at,
        })
        .from(tickets)
        .innerJoin(contacts, eq(contacts.id, tickets.contact_id))
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            ...scopeConditions(scope as DashboardScope),
        ))
        .orderBy(desc(tickets.updated_at))
        .limit(limit);
    },

    /**
     * Desempenho da equipe (só admin): por atendente, quantidade de atendimentos,
     * tempo médio (criação→fechamento dos fechados), agendamentos criados e valor vendido.
     * Atendentes sem movimento no período aparecem zerados.
     */
    async teamPerformance(companyId: string, scope: DashboardScope) {
        const [team, ticketStats, salesByUser, appointmentsByUser] = await Promise.all([
            teamMembers(companyId, scope),
            ticketStatsByAttendant(companyId, scope),
            salesValueByAttendant(companyId, scope),
            appointmentsByCreator(companyId, scope),
        ]);

        return team.map(u => ({
            id: u.id,
            name: u.name,
            atendimentos: ticketStats.get(u.id)?.total ?? 0,
            tempoMedioSegundos: Math.round(ticketStats.get(u.id)?.avgSeconds ?? 0),
            agendamentos: appointmentsByUser.get(u.id) ?? 0,
            valorVendido: salesByUser.get(u.id) ?? 0,
        }));
    },

    async getTopAttendants(companyId: string, scope: Pick<DashboardScope, 'period' | 'startDate' | 'endDate' | 'connectionId' | 'queueId'>) {
        const { start, end } = resolveInterval(scope as DashboardScope);

        return db.select({
            id:    users.id,
            name:  users.name,
            total: sql<number>`count(${tickets.id})::int`,
        })
        .from(tickets)
        .innerJoin(users, eq(users.id, tickets.attendant_user_id))
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            gte(tickets.updated_at, start),
            lte(tickets.updated_at, end),
            scope.connectionId ? eq(tickets.connection_id, scope.connectionId) : undefined,
            scope.queueId      ? eq(tickets.queue_id, scope.queueId)          : undefined,
        ))
        .groupBy(users.id, users.name)
        .orderBy(sql`count(${tickets.id}) desc`)
        .limit(5);
    },

    async getChannelsByPeriod(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);

        return db.select({
            label: sql<string>`COALESCE(${tickets.origin}, 'Base de contatos')`,
            total: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            gte(tickets.updated_at, start),
            lte(tickets.updated_at, end),
            ...scopeConditions(scope),
        ))
        .groupBy(tickets.origin)
        .orderBy(sql`count(*) desc`);
    },

    /** Quantidade de atendimentos (qualquer status, venda ou não) agrupados por conexão. */
    async getTicketsByConnection(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);

        return db.select({
            label: sql<string>`coalesce(${connections.name}, 'Sem conexão')`,
            total: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .leftJoin(connections, eq(connections.id, tickets.connection_id))
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            gte(tickets.updated_at, start),
            lte(tickets.updated_at, end),
            ...scopeConditions(scope),
        ))
        .groupBy(connections.id, connections.name)
        .orderBy(sql`count(*) desc`);
    },

    // ────── Métodos SuperAdmin ──────

    async getSuperAdminStats(period: Period) {
        const { start, end } = getInterval(period);

        const [totalComp]  = await db.select({ total: sql<number>`count(*)::int` }).from(companies);
        const [activeComp] = await db.select({ total: sql<number>`count(*)::int` }).from(companies).where(eq(companies.status, true));
        const [totalUsers] = await db.select({ total: sql<number>`count(*)::int` }).from(users);
        const [newUsers]   = await db.select({ total: sql<number>`count(*)::int` }).from(users)
            .where(and(gte(users.created_at, start), lte(users.created_at, end)));
        const [pending]    = await db.select({ total: sql<number>`count(*)::int` }).from(users)
            .where(eq(users.is_approved, false));

        return {
            empresasAtivas:       activeComp?.total ?? 0,
            totalEmpresas:        totalComp?.total  ?? 0,
            totalUsuarios:        totalUsers?.total  ?? 0,
            novosUsuarios:        newUsers?.total    ?? 0,
            novosCadastros:       newUsers?.total    ?? 0,
            aguardandoAprovacao:  pending?.total     ?? 0,
        };
    },

    async getSuperAdminGraph(period: Period) {
        const { start, end } = getInterval(period);

        const slotCol =
            period === 'day'   ? sql<number>`EXTRACT(HOUR FROM ${brLocal(companies.created_at)})::int`   :
            period === 'week'  ? sql<number>`EXTRACT(ISODOW FROM ${brLocal(companies.created_at)})::int` :
            period === 'month' ? sql<number>`EXTRACT(DAY FROM ${brLocal(companies.created_at)})::int`    :
                                 sql<number>`EXTRACT(MONTH FROM ${brLocal(companies.created_at)})::int`;

        const data = await db.select({ slot: slotCol, total: sql<number>`count(*)::int` })
            .from(companies)
            .where(and(gte(companies.created_at, start), lte(companies.created_at, end)))
            .groupBy(slotCol)
            .orderBy(slotCol);

        return { period, data };
    },

    async getSuperAdminFunnel() {
        const [active]   = await db.select({ total: sql<number>`count(*)::int` }).from(companies).where(eq(companies.status, true));
        const [inactive] = await db.select({ total: sql<number>`count(*)::int` }).from(companies).where(eq(companies.status, false));

        return [
            { name: 'Ativas',   value: active?.total   ?? 0, color: '#22c55e' },
            { name: 'Inativas', value: inactive?.total ?? 0, color: '#94a3b8' },
        ];
    },

    async getSuperAdminRecent() {
        return db.select({
            id:   companies.id,
            nome: companies.name,
            data: companies.created_at,
        })
        .from(companies)
        .orderBy(desc(companies.created_at))
        .limit(5);
    },

    // ────── Financeiro ──────

    _salePriceCast() {
        return sql<number>`CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))`;
    },

    async getFinanceiroKpis(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        const base = and(
            eq(tickets.company_id, companyId),
            eq(tickets.status_id, 3),
            eq(tickets.service_not_made, 0),
            isNull(tickets.deleted_at),
            gte(tickets.updated_at, start),
            lte(tickets.updated_at, end),
            ...scopeConditions(scope),
        );

        const [totalAtend] = await db
            .select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(base);

        const [salesData] = await db
            .select({
                total:   sql<number>`count(*)::int`,
                receita: sql<number>`COALESCE(SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)::float`,
            })
            .from(tickets)
            .where(and(base, eq(tickets.is_sale, 1)));

        const [perdasData] = await db
            .select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(base, eq(tickets.is_sale, 0)));

        const totalVendas   = salesData?.total   ?? 0;
        const receitaTotal  = Number(salesData?.receita ?? 0);
        const totalFechados = totalAtend?.total   ?? 0;
        const perdas        = perdasData?.total   ?? 0;

        return {
            receitaTotal,
            totalVendas,
            ticketMedio:       totalVendas > 0 ? receitaTotal / totalVendas : 0,
            conversao:         totalFechados > 0 ? totalVendas / totalFechados : 0,
            perdas,
            mrrProjetado:      0,
            arrProjetado:      0,
            receitaUnica:      receitaTotal,
            totalAtendimentos: totalFechados,
        };
    },

    async getFinanceiroEvolucao(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                dia:    sql<string>`DATE(${brLocal(tickets.updated_at)})::text`,
                receita: sql<number>`COALESCE(SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)::float`,
                vendas: sql<number>`count(*)::int`,
            })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.status_id, 3),
                eq(tickets.is_sale, 1),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(sql`DATE(${brLocal(tickets.updated_at)})`)
            .orderBy(sql`DATE(${brLocal(tickets.updated_at)})`);
    },

    async getFinanceiroOrigens(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                origem:  sql<string>`COALESCE(${tickets.origin}, 'Base de contatos')`,
                receita: sql<number>`COALESCE(SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)::float`,
                vendas:  sql<number>`count(*)::int`,
            })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.status_id, 3),
                eq(tickets.is_sale, 1),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .groupBy(tickets.origin)
            .orderBy(sql`SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))) desc`)
            .limit(10);
    },

    async getFinanceiroHistorico(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                id:            tickets.id,
                contactName:   contacts.name,
                contactNumber: contacts.number,
                salePrice:     tickets.sale_price,
                origin:        tickets.origin,
                closedAt:      tickets.updated_at,
            })
            .from(tickets)
            .leftJoin(contacts, eq(tickets.contact_id, contacts.id))
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.status_id, 3),
                eq(tickets.is_sale, 1),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .orderBy(desc(tickets.updated_at))
            .limit(200);
    },

    async getFinanceiroPerdas(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                id:              tickets.id,
                contactName:     contacts.name,
                contactNumber:   contacts.number,
                reason:          crm_sales_reasons.reason,
                lossProductName: tickets.loss_product_name,
                closedAt:        tickets.updated_at,
            })
            .from(tickets)
            .leftJoin(contacts, eq(tickets.contact_id, contacts.id))
            .leftJoin(crm_sales_reasons, eq(tickets.reasons_id, crm_sales_reasons.id))
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.status_id, 3),
                eq(tickets.is_sale, 0),
                eq(tickets.service_not_made, 0),
                isNull(tickets.deleted_at),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
                ...scopeConditions(scope),
            ))
            .orderBy(desc(tickets.updated_at))
            .limit(200);
    },
};
