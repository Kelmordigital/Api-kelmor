"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardService = void 0;
exports.parsePeriod = parsePeriod;
exports.getInterval = getInterval;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("./atendimento.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
const company_db_schema_1 = require("../companies/company.db.schema");
const VALID_PERIODS = ['day', 'week', 'month', 'year'];
function parsePeriod(raw) {
    return VALID_PERIODS.includes(raw) ? raw : 'week';
}
const TICKET_STATUS = {
    1: { name: 'Na Fila', color: '#f97316' },
    2: { name: 'Em Atendimento', color: '#6366f1' },
    3: { name: 'Resolvido', color: '#22c55e' },
};
function getInterval(period) {
    const now = new Date();
    let start;
    let end;
    switch (period) {
        case 'day':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            break;
        case 'week': {
            const dow = now.getDay();
            const diff = dow === 0 ? -6 : 1 - dow;
            start = new Date(now);
            start.setDate(now.getDate() + diff);
            start.setHours(0, 0, 0, 0);
            end = new Date(start);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
            break;
        }
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;
        case 'year':
            start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            break;
    }
    return { start, end };
}
function dateRange(start, end) {
    return (0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, new Date(start)), (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, new Date(end)));
}
exports.dashboardService = {
    async salesByConnection(companyId, startDate, endDate) {
        return client_1.db
            .select({
            label: atendimento_db_schema_1.connections.name,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
            totalEmVendas: (0, drizzle_orm_1.sql) `COALESCE(SUM(CAST(REPLACE(REPLACE(${atendimento_db_schema_1.tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)`,
        })
            .from(atendimento_db_schema_1.tickets)
            .innerJoin(atendimento_db_schema_1.connections, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.id, atendimento_db_schema_1.tickets.connection_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 1), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 0), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), dateRange(startDate, endDate)))
            .groupBy(atendimento_db_schema_1.connections.id, atendimento_db_schema_1.connections.name)
            .orderBy((0, drizzle_orm_1.sql) `count(*) desc`);
    },
    async notSalesByConnection(companyId, startDate, endDate) {
        return client_1.db
            .select({
            label: atendimento_db_schema_1.connections.name,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(atendimento_db_schema_1.tickets)
            .innerJoin(atendimento_db_schema_1.connections, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.id, atendimento_db_schema_1.tickets.connection_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 0), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 0), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), dateRange(startDate, endDate)))
            .groupBy(atendimento_db_schema_1.connections.id, atendimento_db_schema_1.connections.name)
            .orderBy((0, drizzle_orm_1.sql) `count(*) desc`);
    },
    async notSalesByChannel(companyId, startDate, endDate) {
        return client_1.db
            .select({
            label: (0, drizzle_orm_1.sql) `COALESCE(${atendimento_db_schema_1.tickets.origin}, 'Base de contatos')`,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 0), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 0), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), dateRange(startDate, endDate)))
            .groupBy(atendimento_db_schema_1.tickets.origin)
            .orderBy((0, drizzle_orm_1.sql) `count(*) desc`);
    },
    async salesByChannel(companyId, startDate, endDate) {
        return client_1.db
            .select({
            label: (0, drizzle_orm_1.sql) `COALESCE(${atendimento_db_schema_1.tickets.origin}, 'Base de contatos')`,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
            totalEmVendas: (0, drizzle_orm_1.sql) `COALESCE(SUM(CAST(REPLACE(REPLACE(${atendimento_db_schema_1.tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)`,
        })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 1), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 0), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), dateRange(startDate, endDate)))
            .groupBy(atendimento_db_schema_1.tickets.origin)
            .orderBy((0, drizzle_orm_1.sql) `count(*) desc`);
    },
    async listReasons(companyId) {
        return client_1.db.select().from(atendimento_db_schema_1.crm_sales_reasons).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_sales_reasons.company_id, companyId));
    },
    async createReason(companyId, reason, color) {
        const [r] = await client_1.db.insert(atendimento_db_schema_1.crm_sales_reasons).values({ company_id: companyId, reason, color }).returning();
        return r;
    },
    // ────── Novos métodos de dashboard ──────
    async getKpis(companyId, period, attendantId) {
        const { start, end } = getInterval(period);
        const [newTickets] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined, (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.created_at, start), (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.created_at, end)));
        const [totalAll] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined));
        const [activeNow] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined, (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.status_id, [1, 2])));
        const [naFila] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 1)));
        const [resolved] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, start), (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, end)));
        const msgs = await client_1.db.select({
            from_me: atendimento_db_schema_1.atendimento_messages.from_me,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(atendimento_db_schema_1.atendimento_messages)
            .innerJoin(atendimento_db_schema_1.tickets, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, atendimento_db_schema_1.atendimento_messages.ticket_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined, (0, drizzle_orm_1.gte)(atendimento_db_schema_1.atendimento_messages.created_at, start), (0, drizzle_orm_1.lte)(atendimento_db_schema_1.atendimento_messages.created_at, end)))
            .groupBy(atendimento_db_schema_1.atendimento_messages.from_me);
        const enviadas = msgs.find(m => m.from_me === true)?.total ?? 0;
        const recebidas = msgs.find(m => m.from_me === false)?.total ?? 0;
        const novas = newTickets?.total ?? 0;
        const total = totalAll?.total ?? 0;
        const resolvidos = resolved?.total ?? 0;
        return {
            novasConversas: novas,
            novasConversasTotal: total,
            conversasAtivas: activeNow?.total ?? 0,
            enviadas,
            recebidas,
            taxaResolucao: total > 0 ? Math.round((resolvidos / total) * 100) : 0,
            resolvidos,
            naFila: naFila?.total ?? 0,
        };
    },
    async getGraph(companyId, period, attendantId) {
        const { start, end } = getInterval(period);
        const slotCol = period === 'day' ? (0, drizzle_orm_1.sql) `EXTRACT(HOUR FROM ${atendimento_db_schema_1.tickets.created_at})::int` :
            period === 'week' ? (0, drizzle_orm_1.sql) `EXTRACT(ISODOW FROM ${atendimento_db_schema_1.tickets.created_at})::int` :
                period === 'month' ? (0, drizzle_orm_1.sql) `EXTRACT(DAY FROM ${atendimento_db_schema_1.tickets.created_at})::int` :
                    (0, drizzle_orm_1.sql) `EXTRACT(MONTH FROM ${atendimento_db_schema_1.tickets.created_at})::int`;
        const data = await client_1.db.select({ slot: slotCol, total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined, (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.created_at, start), (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.created_at, end)))
            .groupBy(slotCol)
            .orderBy(slotCol);
        return { period, data };
    },
    async getMovimentos(companyId, period, attendantId) {
        const { start, end } = getInterval(period);
        const rows = await client_1.db.select({
            status_id: atendimento_db_schema_1.tickets.status_id,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined, (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, start), (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, end)))
            .groupBy(atendimento_db_schema_1.tickets.status_id);
        return rows.map(r => ({
            label: TICKET_STATUS[r.status_id]?.name ?? `Status ${r.status_id}`,
            value: r.total,
            color: TICKET_STATUS[r.status_id]?.color ?? '#94a3b8',
        }));
    },
    async getFunnel(companyId, attendantId) {
        const rows = await client_1.db.select({
            status_id: atendimento_db_schema_1.tickets.status_id,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined))
            .groupBy(atendimento_db_schema_1.tickets.status_id);
        return rows.map(r => ({
            name: TICKET_STATUS[r.status_id]?.name ?? `Status ${r.status_id}`,
            value: r.total,
            color: TICKET_STATUS[r.status_id]?.color ?? '#94a3b8',
        }));
    },
    async getRecent(companyId, limit = 5, attendantId) {
        return client_1.db.select({
            id: atendimento_db_schema_1.tickets.id,
            nome: atendimento_db_schema_1.contacts.name,
            telefone: atendimento_db_schema_1.contacts.number,
            data: atendimento_db_schema_1.tickets.updated_at,
        })
            .from(atendimento_db_schema_1.tickets)
            .innerJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, atendimento_db_schema_1.tickets.contact_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined))
            .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.updated_at))
            .limit(limit);
    },
    async getTopAttendants(companyId, period) {
        const { start, end } = getInterval(period);
        return client_1.db.select({
            id: auth_schema_1.users.id,
            name: auth_schema_1.users.name,
            total: (0, drizzle_orm_1.sql) `count(${atendimento_db_schema_1.tickets.id})::int`,
        })
            .from(atendimento_db_schema_1.tickets)
            .innerJoin(auth_schema_1.users, (0, drizzle_orm_1.eq)(auth_schema_1.users.id, atendimento_db_schema_1.tickets.attendant_user_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, start), (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, end)))
            .groupBy(auth_schema_1.users.id, auth_schema_1.users.name)
            .orderBy((0, drizzle_orm_1.sql) `count(${atendimento_db_schema_1.tickets.id}) desc`)
            .limit(5);
    },
    async getChannelsByPeriod(companyId, period, attendantId) {
        const { start, end } = getInterval(period);
        return client_1.db.select({
            label: (0, drizzle_orm_1.sql) `COALESCE(${atendimento_db_schema_1.tickets.origin}, 'Base de contatos')`,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), attendantId ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, attendantId) : undefined, (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, start), (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, end)))
            .groupBy(atendimento_db_schema_1.tickets.origin)
            .orderBy((0, drizzle_orm_1.sql) `count(*) desc`);
    },
    // ────── Métodos SuperAdmin ──────
    async getSuperAdminStats(period) {
        const { start, end } = getInterval(period);
        const [totalComp] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` }).from(company_db_schema_1.companies);
        const [activeComp] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` }).from(company_db_schema_1.companies).where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.status, true));
        const [totalUsers] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` }).from(auth_schema_1.users);
        const [newUsers] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` }).from(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(auth_schema_1.users.created_at, start), (0, drizzle_orm_1.lte)(auth_schema_1.users.created_at, end)));
        const [pending] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` }).from(auth_schema_1.users)
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.is_approved, false));
        return {
            empresasAtivas: activeComp?.total ?? 0,
            totalEmpresas: totalComp?.total ?? 0,
            totalUsuarios: totalUsers?.total ?? 0,
            novosUsuarios: newUsers?.total ?? 0,
            novosCadastros: newUsers?.total ?? 0,
            aguardandoAprovacao: pending?.total ?? 0,
        };
    },
    async getSuperAdminGraph(period) {
        const { start, end } = getInterval(period);
        const slotCol = period === 'day' ? (0, drizzle_orm_1.sql) `EXTRACT(HOUR FROM ${company_db_schema_1.companies.created_at})::int` :
            period === 'week' ? (0, drizzle_orm_1.sql) `EXTRACT(ISODOW FROM ${company_db_schema_1.companies.created_at})::int` :
                period === 'month' ? (0, drizzle_orm_1.sql) `EXTRACT(DAY FROM ${company_db_schema_1.companies.created_at})::int` :
                    (0, drizzle_orm_1.sql) `EXTRACT(MONTH FROM ${company_db_schema_1.companies.created_at})::int`;
        const data = await client_1.db.select({ slot: slotCol, total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(company_db_schema_1.companies)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(company_db_schema_1.companies.created_at, start), (0, drizzle_orm_1.lte)(company_db_schema_1.companies.created_at, end)))
            .groupBy(slotCol)
            .orderBy(slotCol);
        return { period, data };
    },
    async getSuperAdminFunnel() {
        const [active] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` }).from(company_db_schema_1.companies).where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.status, true));
        const [inactive] = await client_1.db.select({ total: (0, drizzle_orm_1.sql) `count(*)::int` }).from(company_db_schema_1.companies).where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.status, false));
        return [
            { name: 'Ativas', value: active?.total ?? 0, color: '#22c55e' },
            { name: 'Inativas', value: inactive?.total ?? 0, color: '#94a3b8' },
        ];
    },
    async getSuperAdminRecent() {
        return client_1.db.select({
            id: company_db_schema_1.companies.id,
            nome: company_db_schema_1.companies.name,
            data: company_db_schema_1.companies.created_at,
        })
            .from(company_db_schema_1.companies)
            .orderBy((0, drizzle_orm_1.desc)(company_db_schema_1.companies.created_at))
            .limit(5);
    },
    // ────── Financeiro ──────
    _salePriceCast() {
        return (0, drizzle_orm_1.sql) `CAST(REPLACE(REPLACE(${atendimento_db_schema_1.tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))`;
    },
    async getFinanceiroKpis(companyId, start, end) {
        const base = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 0), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), start ? (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, start) : undefined, end ? (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, end) : undefined);
        const [totalAtend] = await client_1.db
            .select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(atendimento_db_schema_1.tickets)
            .where(base);
        const [salesData] = await client_1.db
            .select({
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
            receita: (0, drizzle_orm_1.sql) `COALESCE(SUM(CAST(REPLACE(REPLACE(${atendimento_db_schema_1.tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)::float`,
        })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)(base, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 1)));
        const [perdasData] = await client_1.db
            .select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)(base, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 0)));
        const totalVendas = salesData?.total ?? 0;
        const receitaTotal = Number(salesData?.receita ?? 0);
        const totalFechados = totalAtend?.total ?? 0;
        const perdas = perdasData?.total ?? 0;
        return {
            receitaTotal,
            totalVendas,
            ticketMedio: totalVendas > 0 ? receitaTotal / totalVendas : 0,
            conversao: totalFechados > 0 ? totalVendas / totalFechados : 0,
            perdas,
            mrrProjetado: 0,
            arrProjetado: 0,
            receitaUnica: receitaTotal,
            totalAtendimentos: totalFechados,
        };
    },
    async getFinanceiroEvolucao(companyId, start, end) {
        return client_1.db
            .select({
            dia: (0, drizzle_orm_1.sql) `DATE(${atendimento_db_schema_1.tickets.updated_at})::text`,
            receita: (0, drizzle_orm_1.sql) `COALESCE(SUM(CAST(REPLACE(REPLACE(${atendimento_db_schema_1.tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)::float`,
            vendas: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 1), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 0), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), start ? (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, start) : undefined, end ? (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, end) : undefined))
            .groupBy((0, drizzle_orm_1.sql) `DATE(${atendimento_db_schema_1.tickets.updated_at})`)
            .orderBy((0, drizzle_orm_1.sql) `DATE(${atendimento_db_schema_1.tickets.updated_at})`);
    },
    async getFinanceiroOrigens(companyId, start, end) {
        return client_1.db
            .select({
            origem: (0, drizzle_orm_1.sql) `COALESCE(${atendimento_db_schema_1.tickets.origin}, 'Base de contatos')`,
            receita: (0, drizzle_orm_1.sql) `COALESCE(SUM(CAST(REPLACE(REPLACE(${atendimento_db_schema_1.tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))), 0)::float`,
            vendas: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 1), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 0), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), start ? (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, start) : undefined, end ? (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, end) : undefined))
            .groupBy(atendimento_db_schema_1.tickets.origin)
            .orderBy((0, drizzle_orm_1.sql) `SUM(CAST(REPLACE(REPLACE(${atendimento_db_schema_1.tickets.sale_price}, '.', ''), ',', '.') AS DECIMAL(10,2))) desc`)
            .limit(10);
    },
    async getFinanceiroHistorico(companyId, start, end) {
        return client_1.db
            .select({
            id: atendimento_db_schema_1.tickets.id,
            contactName: atendimento_db_schema_1.contacts.name,
            contactNumber: atendimento_db_schema_1.contacts.number,
            salePrice: atendimento_db_schema_1.tickets.sale_price,
            origin: atendimento_db_schema_1.tickets.origin,
            closedAt: atendimento_db_schema_1.tickets.updated_at,
        })
            .from(atendimento_db_schema_1.tickets)
            .leftJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, atendimento_db_schema_1.contacts.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 1), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 0), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), start ? (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, start) : undefined, end ? (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, end) : undefined))
            .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.updated_at))
            .limit(200);
    },
    async getFinanceiroPerdas(companyId, start, end) {
        return client_1.db
            .select({
            id: atendimento_db_schema_1.tickets.id,
            contactName: atendimento_db_schema_1.contacts.name,
            contactNumber: atendimento_db_schema_1.contacts.number,
            reason: atendimento_db_schema_1.crm_sales_reasons.reason,
            lossProductName: atendimento_db_schema_1.tickets.loss_product_name,
            closedAt: atendimento_db_schema_1.tickets.updated_at,
        })
            .from(atendimento_db_schema_1.tickets)
            .leftJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, atendimento_db_schema_1.contacts.id))
            .leftJoin(atendimento_db_schema_1.crm_sales_reasons, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.reasons_id, atendimento_db_schema_1.crm_sales_reasons.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 0), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 0), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), start ? (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, start) : undefined, end ? (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, end) : undefined))
            .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.updated_at))
            .limit(200);
    },
};
//# sourceMappingURL=dashboard.service.js.map