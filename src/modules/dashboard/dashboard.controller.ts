import type { FastifyReply, FastifyRequest } from 'fastify';
import { parsePeriod } from '../../core/time/period';
import { ForbiddenError } from '../../core/errors/http-errors';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { optionalInt, optionalText } from '../../core/validation/query-params';
import { z } from 'zod';
import type { CustomerValueQueries } from './customer-value.queries';
import {
    parseDashboardFilter, type DashboardScope,
    type SalesAnalytics, type ActivityAnalytics, type FinanceAnalytics, type PlatformStats,
} from './dashboard.queries';

/**
 * Filtro do painel (período/datas/conexão/fila/usuário). Atendente comum fica sempre
 * travado nos próprios números; admin escolhe o atendente pela query. Intervalo de
 * datas acima do limite → 400 (DateRangeTooLargeError, tratado pelo errorHandler).
 */
export function requestScope(req: FastifyRequest): DashboardScope {
    const parsed = parseDashboardFilter(req.query as Record<string, unknown>);
    const { profile_tag, id: userId } = req.user;
    return {
        period:       parsed.period,
        startDate:    parsed.startDate,
        endDate:      parsed.endDate,
        connectionId: parsed.connectionId,
        queueId:      parsed.queueId,
        attendantId:  profile_tag === 'user' ? userId : parsed.attendantUserId,
    };
}

type Handler = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

const customersQuery = z.object({
    connectionId: optionalInt('connectionId'),
    search:       optionalText,
    sort:         z.preprocess((v) => (v === '' ? undefined : v), z.enum(['total', 'compras', 'ultima']).default('total')),
    limit:        optionalInt('limit'),
    offset:       optionalInt('offset'),
});

/** LTV é visão do dono: atendente não vê; superAdmin (sem empresa) recebe vazio. */
function ownerCompany(req: FastifyRequest): string | null {
    if (req.user.profile_tag === 'user') throw new ForbiddenError('Forbidden');
    return req.user.profile_tag === 'superAdmin' ? null : req.user.company_id ?? null;
}
const periodOf = (req: FastifyRequest) => parsePeriod((req.query as { period?: string }).period);

/** Adapta HTTP ⇄ consultas do painel e do financeiro, mantendo as regras por perfil. */
export class DashboardController {
    constructor(
        private readonly sales: SalesAnalytics,
        private readonly activity: ActivityAnalytics,
        private readonly finance: FinanceAnalytics,
        private readonly platform: PlatformStats,
        private readonly customerValue: CustomerValueQueries,
    ) {}

    private scoped(run: (companyId: string, scope: DashboardScope, req: FastifyRequest) => Promise<unknown>): Handler {
        return async (req, reply) => reply.send(await run(req.user.company_id!, requestScope(req), req));
    }

    // ── Analytics de vendas ──
    salesByConnection        = this.scoped((c, s) => this.sales.salesByConnection(c, s));
    salesByChannel           = this.scoped((c, s) => this.sales.salesByChannel(c, s));
    notSalesByConnection     = this.scoped((c, s) => this.sales.notSalesByConnection(c, s));
    notSalesByChannel        = this.scoped((c, s) => this.sales.notSalesByChannel(c, s));
    notSalesByReason         = this.scoped((c, s) => this.sales.notSalesByReason(c, s));
    notSalesByReasonOverTime = this.scoped((c, s) => this.sales.notSalesByReasonOverTime(c, s));
    topCustomers = this.scoped((c, s, req) => {
        const { limit } = req.query as { limit?: string };
        return this.sales.topCustomers(c, s, limit ? Number(limit) : undefined);
    });

    // ── Painel por período ──
    kpis: Handler = async (req, reply) => {
        if (req.user.profile_tag === 'superAdmin') return reply.send(await this.platform.getSuperAdminStats(periodOf(req)));
        return reply.send(await this.activity.getKpis(req.user.company_id!, requestScope(req)));
    };

    graph: Handler = async (req, reply) => {
        if (req.user.profile_tag === 'superAdmin') return reply.send(await this.platform.getSuperAdminGraph(periodOf(req)));
        return reply.send(await this.activity.getGraph(req.user.company_id!, requestScope(req)));
    };

    graphByStatus: Handler = async (req, reply) => {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin' || !company_id) return reply.send({ period: 'day', data: [] });
        return reply.send(await this.activity.getGraphByStatus(company_id, requestScope(req)));
    };

    funnel: Handler = async (req, reply) => {
        if (req.user.profile_tag === 'superAdmin') return reply.send(await this.platform.getSuperAdminFunnel());
        return reply.send(await this.activity.getFunnel(req.user.company_id!, requestScope(req)));
    };

    movimentos: Handler = async (req, reply) => {
        if (req.user.profile_tag === 'superAdmin') return reply.send([]);
        return reply.send(await this.activity.getMovimentos(req.user.company_id!, requestScope(req)));
    };

    recent: Handler = async (req, reply) => {
        const { limit } = req.query as { limit?: string };
        if (req.user.profile_tag === 'superAdmin') return reply.send(await this.platform.getSuperAdminRecent());
        return reply.send(await this.activity.getRecent(req.user.company_id!, Number(limit ?? 5), requestScope(req)));
    };

    topAttendants: Handler = async (req, reply) => {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'user') throw new ForbiddenError('Forbidden');
        if (profile_tag === 'superAdmin' || !company_id) return reply.send([]);
        return reply.send(await this.activity.getTopAttendants(company_id, requestScope(req)));
    };

    teamPerformance: Handler = async (req, reply) => {
        const { profile_tag, company_id } = req.user;
        if (profile_tag !== 'admin' || !company_id) throw new ForbiddenError('Forbidden');
        return reply.send(await this.activity.teamPerformance(company_id, requestScope(req)));
    };

    channels: Handler = async (req, reply) => {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin' || !company_id) return reply.send([]);
        return reply.send(await this.activity.getChannelsByPeriod(company_id, requestScope(req)));
    };

    ticketsByConnection: Handler = async (req, reply) => {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin' || !company_id) return reply.send([]);
        return reply.send(await this.activity.getTicketsByConnection(company_id, requestScope(req)));
    };

    // ── Financeiro: clientes (LTV e recompra) ──
    customers: Handler = async (req, reply) => {
        const companyId = ownerCompany(req);
        const q = SchemaValidator.parse(customersQuery, req.query);
        if (!companyId) return reply.send({ items: [], total: 0 });
        return reply.send(await this.customerValue.ranking(companyId, {
            connectionId: q.connectionId, search: q.search, sort: q.sort,
            limit: Math.min(Math.max(q.limit ?? 50, 1), 200), offset: Math.max(q.offset ?? 0, 0),
        }));
    };

    customersSummary: Handler = async (req, reply) => {
        const companyId = ownerCompany(req);
        const q = SchemaValidator.parse(customersQuery, req.query);
        if (!companyId) return reply.send({ ltv: 0, repeatRate: 0, customers: 0, avgTicket: 0, cohorts: [] });
        return reply.send(await this.customerValue.summary(companyId, { connectionId: q.connectionId }));
    };

    // ── Financeiro ──
    financeiroKpis      = this.scoped((c, s) => this.finance.getFinanceiroKpis(c, s));
    financeiroEvolucao  = this.scoped((c, s) => this.finance.getFinanceiroEvolucao(c, s));
    financeiroOrigens   = this.scoped((c, s) => this.finance.getFinanceiroOrigens(c, s));
    financeiroHistorico = this.scoped((c, s) => this.finance.getFinanceiroHistorico(c, s));
    financeiroPerdas    = this.scoped((c, s) => this.finance.getFinanceiroPerdas(c, s));
}
