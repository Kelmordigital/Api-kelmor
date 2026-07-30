import { sql, and, or, eq, isNull, gte, lte, desc, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import {
    tickets, connections, crm_sales_reasons, contacts, atendimento_messages,
} from './atendimento.db.schema';
import { users } from '../auth/auth.schema';
import { companies } from '../companies/company.db.schema';

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
            start: new Date(`${scope.startDate}T00:00:00`),
            end:   new Date(`${scope.endDate}T23:59:59.999`),
        };
    }
    return getInterval(scope.period);
}

const TICKET_STATUS: Record<number, { name: string; color: string }> = {
    1: { name: 'Na Fila',        color: '#f97316' },
    2: { name: 'Em Atendimento', color: '#6366f1' },
    3: { name: 'Resolvido',      color: '#22c55e' },
};

export function getInterval(period: Period) {
    const now = new Date();
    let start: Date;
    let end: Date;
    switch (period) {
        case 'day':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;
        case 'week': {
            const dow = now.getDay();
            const diff = dow === 0 ? -6 : 1 - dow;
            start = new Date(now); start.setDate(now.getDate() + diff); start.setHours(0, 0, 0, 0);
            end   = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
            break;
        }
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;
        case 'year':
            start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            break;
    }
    return { start, end };
}

export const dashboardService = {

    async salesByConnection(companyId: string, scope: DashboardScope) {
        const { start, end } = resolveInterval(scope);
        return db
            .select({
                label: connections.name,
                total: sql<number>`count(*)::int`,
                totalEmVendas: sql<number>`COALESCE(SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)`,
            })
            .from(tickets)
            .innerJoin(connections, eq(connections.id, tickets.connection_id))
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
                label: connections.name,
                total: sql<number>`count(*)::int`,
            })
            .from(tickets)
            .innerJoin(connections, eq(connections.id, tickets.connection_id))
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
            ? sql<string>`DATE(${tickets.created_at})::text`
            : period === 'day'   ? sql<number>`EXTRACT(HOUR FROM ${tickets.created_at})::int`
            : period === 'week'  ? sql<number>`EXTRACT(ISODOW FROM ${tickets.created_at})::int`
            : period === 'month' ? sql<number>`EXTRACT(DAY FROM ${tickets.created_at})::int`
                                 : sql<number>`EXTRACT(MONTH FROM ${tickets.created_at})::int`;

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
            label: connections.name,
            total: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .innerJoin(connections, eq(connections.id, tickets.connection_id))
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
            period === 'day'   ? sql<number>`EXTRACT(HOUR FROM ${companies.created_at})::int`   :
            period === 'week'  ? sql<number>`EXTRACT(ISODOW FROM ${companies.created_at})::int` :
            period === 'month' ? sql<number>`EXTRACT(DAY FROM ${companies.created_at})::int`    :
                                 sql<number>`EXTRACT(MONTH FROM ${companies.created_at})::int`;

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

    async getFinanceiroKpis(companyId: string, start?: Date, end?: Date) {
        const base = and(
            eq(tickets.company_id, companyId),
            eq(tickets.status_id, 3),
            eq(tickets.service_not_made, 0),
            isNull(tickets.deleted_at),
            start ? gte(tickets.updated_at, start) : undefined,
            end   ? lte(tickets.updated_at, end)   : undefined,
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

    async getFinanceiroEvolucao(companyId: string, start?: Date, end?: Date) {
        return db
            .select({
                dia:    sql<string>`DATE(${tickets.updated_at})::text`,
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
                start ? gte(tickets.updated_at, start) : undefined,
                end   ? lte(tickets.updated_at, end)   : undefined,
            ))
            .groupBy(sql`DATE(${tickets.updated_at})`)
            .orderBy(sql`DATE(${tickets.updated_at})`);
    },

    async getFinanceiroOrigens(companyId: string, start?: Date, end?: Date) {
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
                start ? gte(tickets.updated_at, start) : undefined,
                end   ? lte(tickets.updated_at, end)   : undefined,
            ))
            .groupBy(tickets.origin)
            .orderBy(sql`SUM(CAST(REPLACE(REPLACE(${tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))) desc`)
            .limit(10);
    },

    async getFinanceiroHistorico(companyId: string, start?: Date, end?: Date) {
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
                start ? gte(tickets.updated_at, start) : undefined,
                end   ? lte(tickets.updated_at, end)   : undefined,
            ))
            .orderBy(desc(tickets.updated_at))
            .limit(200);
    },

    async getFinanceiroPerdas(companyId: string, start?: Date, end?: Date) {
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
                start ? gte(tickets.updated_at, start) : undefined,
                end   ? lte(tickets.updated_at, end)   : undefined,
            ))
            .orderBy(desc(tickets.updated_at))
            .limit(200);
    },
};
