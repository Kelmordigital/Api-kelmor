export type Period = 'day' | 'week' | 'month' | 'year';
export declare function parsePeriod(raw: unknown): Period;
export declare class DateRangeTooLargeError extends Error {
    constructor();
}
/** Escopo completo de um pedido de dashboard: período (preset OU datas exatas) + conexão/fila/atendente. */
export interface DashboardScope {
    period: Period;
    startDate?: string;
    endDate?: string;
    connectionId?: number;
    queueId?: number;
    attendantId?: string;
}
/** Lê e valida os parâmetros de filtro comuns a todos os endpoints de dashboard. */
export declare function parseDashboardFilter(query: Record<string, unknown>): Omit<DashboardScope, 'attendantId'> & {
    attendantUserId?: string;
};
export declare function getInterval(period: Period): {
    start: Date;
    end: Date;
};
export declare const dashboardService: {
    salesByConnection(companyId: string, scope: DashboardScope): Promise<{
        label: string;
        total: number;
        totalEmVendas: number;
    }[]>;
    notSalesByConnection(companyId: string, scope: DashboardScope): Promise<{
        label: string;
        total: number;
    }[]>;
    notSalesByChannel(companyId: string, scope: DashboardScope): Promise<{
        label: string;
        total: number;
    }[]>;
    notSalesByReason(companyId: string, scope: DashboardScope): Promise<{
        label: string;
        total: number;
    }[]>;
    /**
     * Pivotado ao longo do tempo (mesma granularidade do gráfico "Novos
     * Contatos" — hora/dia da semana/dia do mês/mês — ver getGraph) pra
     * alimentar o gráfico empilhado por motivo. `updated_at` (não
     * `created_at`) porque o que importa aqui é quando a não-venda aconteceu
     * (fechamento), igual às outras queries de not-sales desta empresa.
     */
    notSalesByReasonOverTime(companyId: string, scope: DashboardScope): Promise<{
        reasons: string[];
        buckets: Record<string, string | number>[];
    }>;
    salesByChannel(companyId: string, scope: DashboardScope): Promise<{
        label: string;
        total: number;
        totalEmVendas: number;
    }[]>;
    /** Top clientes por valor gasto no período — card "Maiores clientes" do AdminDashboard. */
    topCustomers(companyId: string, scope: DashboardScope, limit?: number): Promise<{
        contactId: number;
        name: string;
        pedidos: number;
        total: number;
    }[]>;
    listReasons(companyId: string): Promise<{
        id: number;
        company_id: string;
        reason: string;
        color: string | null;
    }[]>;
    createReason(companyId: string, reason: string, color?: string): Promise<{
        id: number;
        company_id: string;
        color: string | null;
        reason: string;
    }>;
    getKpis(companyId: string, scope: DashboardScope): Promise<{
        novasConversas: number;
        novasConversasTotal: number;
        conversasAtivas: number;
        enviadas: number;
        recebidas: number;
        taxaResolucao: number;
        resolvidos: number;
        naFila: number;
    }>;
    getGraph(companyId: string, scope: DashboardScope): Promise<{
        period: Period;
        data: {
            slot: string | number;
            total: number;
        }[];
    }>;
    /** Igual a getGraph, mas quebrado por status_id — alimenta o gráfico empilhado "Atendimentos por período". */
    getGraphByStatus(companyId: string, scope: DashboardScope): Promise<{
        period: Period;
        data: {
            slot: string | number;
            status_id: number;
            total: number;
        }[];
    }>;
    getMovimentos(companyId: string, scope: DashboardScope): Promise<{
        label: string;
        value: number;
        color: string;
    }[]>;
    getFunnel(companyId: string, scope: Pick<DashboardScope, "attendantId" | "connectionId" | "queueId">): Promise<{
        name: string;
        value: number;
        color: string;
    }[]>;
    getRecent(companyId: string, limit: number, scope: Pick<DashboardScope, "attendantId" | "connectionId" | "queueId">): Promise<{
        id: number;
        nome: string;
        telefone: string | null;
        data: Date | null;
    }[]>;
    getTopAttendants(companyId: string, scope: Pick<DashboardScope, "period" | "startDate" | "endDate" | "connectionId" | "queueId">): Promise<{
        id: string;
        name: string;
        total: number;
    }[]>;
    getChannelsByPeriod(companyId: string, scope: DashboardScope): Promise<{
        label: string;
        total: number;
    }[]>;
    /** Quantidade de atendimentos (qualquer status, venda ou não) agrupados por conexão. */
    getTicketsByConnection(companyId: string, scope: DashboardScope): Promise<{
        label: string;
        total: number;
    }[]>;
    getSuperAdminStats(period: Period): Promise<{
        empresasAtivas: number;
        totalEmpresas: number;
        totalUsuarios: number;
        novosUsuarios: number;
        novosCadastros: number;
        aguardandoAprovacao: number;
    }>;
    getSuperAdminGraph(period: Period): Promise<{
        period: Period;
        data: {
            slot: number;
            total: number;
        }[];
    }>;
    getSuperAdminFunnel(): Promise<{
        name: string;
        value: number;
        color: string;
    }[]>;
    getSuperAdminRecent(): Promise<{
        id: string;
        nome: string;
        data: Date | null;
    }[]>;
    _salePriceCast(): import("drizzle-orm").SQL<number>;
    getFinanceiroKpis(companyId: string, scope: DashboardScope): Promise<{
        receitaTotal: number;
        totalVendas: number;
        ticketMedio: number;
        conversao: number;
        perdas: number;
        mrrProjetado: number;
        arrProjetado: number;
        receitaUnica: number;
        totalAtendimentos: number;
    }>;
    getFinanceiroEvolucao(companyId: string, scope: DashboardScope): Promise<{
        dia: string;
        receita: number;
        vendas: number;
    }[]>;
    getFinanceiroOrigens(companyId: string, scope: DashboardScope): Promise<{
        origem: string;
        receita: number;
        vendas: number;
    }[]>;
    getFinanceiroHistorico(companyId: string, scope: DashboardScope): Promise<{
        id: number;
        contactName: string | null;
        contactNumber: string | null;
        salePrice: string | null;
        origin: string | null;
        closedAt: Date | null;
    }[]>;
    getFinanceiroPerdas(companyId: string, scope: DashboardScope): Promise<{
        id: number;
        contactName: string | null;
        contactNumber: string | null;
        reason: string | null;
        lossProductName: string | null;
        closedAt: Date | null;
    }[]>;
};
//# sourceMappingURL=dashboard.service.d.ts.map