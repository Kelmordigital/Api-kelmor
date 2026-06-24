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

function dateRange(start: string, end: string) {
    return and(
        gte(tickets.updated_at, new Date(start)),
        lte(tickets.updated_at, new Date(end)),
    );
}

export const dashboardService = {

    async salesByConnection(companyId: string, startDate: string, endDate: string) {
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
                dateRange(startDate, endDate),
            ))
            .groupBy(connections.id, connections.name)
            .orderBy(sql`count(*) desc`);
    },

    async notSalesByConnection(companyId: string, startDate: string, endDate: string) {
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
                dateRange(startDate, endDate),
            ))
            .groupBy(connections.id, connections.name)
            .orderBy(sql`count(*) desc`);
    },

    async notSalesByChannel(companyId: string, startDate: string, endDate: string) {
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
                dateRange(startDate, endDate),
            ))
            .groupBy(tickets.origin)
            .orderBy(sql`count(*) desc`);
    },

    async salesByChannel(companyId: string, startDate: string, endDate: string) {
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
                dateRange(startDate, endDate),
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

    async getKpis(companyId: string, period: Period, attendantId?: string) {
        const { start, end } = getInterval(period);

        const [newTickets] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
                gte(tickets.created_at, start),
                lte(tickets.created_at, end),
            ));

        const [totalAll] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
            ));

        const [activeNow] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
                inArray(tickets.status_id, [1, 2]),
            ));

        const [naFila] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                eq(tickets.status_id, 1),
            ));

        const [resolved] = await db.select({ total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
                eq(tickets.status_id, 3),
                gte(tickets.updated_at, start),
                lte(tickets.updated_at, end),
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
            attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
            gte(atendimento_messages.created_at, start),
            lte(atendimento_messages.created_at, end),
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

    async getGraph(companyId: string, period: Period, attendantId?: string) {
        const { start, end } = getInterval(period);

        const slotCol =
            period === 'day'   ? sql<number>`EXTRACT(HOUR FROM ${tickets.created_at})::int`   :
            period === 'week'  ? sql<number>`EXTRACT(ISODOW FROM ${tickets.created_at})::int` :
            period === 'month' ? sql<number>`EXTRACT(DAY FROM ${tickets.created_at})::int`    :
                                 sql<number>`EXTRACT(MONTH FROM ${tickets.created_at})::int`;

        const data = await db.select({ slot: slotCol, total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
                gte(tickets.created_at, start),
                lte(tickets.created_at, end),
            ))
            .groupBy(slotCol)
            .orderBy(slotCol);

        return { period, data };
    },

    async getMovimentos(companyId: string, period: Period, attendantId?: string) {
        const { start, end } = getInterval(period);

        const rows = await db.select({
            status_id: tickets.status_id,
            total:     sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
            gte(tickets.updated_at, start),
            lte(tickets.updated_at, end),
        ))
        .groupBy(tickets.status_id);

        return rows.map(r => ({
            label: TICKET_STATUS[r.status_id]?.name  ?? `Status ${r.status_id}`,
            value: r.total,
            color: TICKET_STATUS[r.status_id]?.color ?? '#94a3b8',
        }));
    },

    async getFunnel(companyId: string, attendantId?: string) {
        const rows = await db.select({
            status_id: tickets.status_id,
            total:     sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
        ))
        .groupBy(tickets.status_id);

        return rows.map(r => ({
            name:  TICKET_STATUS[r.status_id]?.name  ?? `Status ${r.status_id}`,
            value: r.total,
            color: TICKET_STATUS[r.status_id]?.color ?? '#94a3b8',
        }));
    },

    async getRecent(companyId: string, limit = 5, attendantId?: string) {
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
            attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
        ))
        .orderBy(desc(tickets.updated_at))
        .limit(limit);
    },

    async getTopAttendants(companyId: string, period: Period) {
        const { start, end } = getInterval(period);

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
        ))
        .groupBy(users.id, users.name)
        .orderBy(sql`count(${tickets.id}) desc`)
        .limit(5);
    },

    async getChannelsByPeriod(companyId: string, period: Period, attendantId?: string) {
        const { start, end } = getInterval(period);

        return db.select({
            label: sql<string>`COALESCE(${tickets.origin}, 'Base de contatos')`,
            total: sql<number>`count(*)::int`,
        })
        .from(tickets)
        .where(and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            attendantId ? eq(tickets.attendant_user_id, attendantId) : undefined,
            gte(tickets.updated_at, start),
            lte(tickets.updated_at, end),
        ))
        .groupBy(tickets.origin)
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
};
