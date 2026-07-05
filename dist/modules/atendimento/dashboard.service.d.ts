export type Period = 'day' | 'week' | 'month' | 'year';
export declare function parsePeriod(raw: unknown): Period;
export declare function getInterval(period: Period): {
    start: Date;
    end: Date;
};
export declare const dashboardService: {
    salesByConnection(companyId: string, startDate: string, endDate: string): Promise<{
        label: string;
        total: number;
        totalEmVendas: number;
    }[]>;
    notSalesByConnection(companyId: string, startDate: string, endDate: string): Promise<{
        label: string;
        total: number;
    }[]>;
    notSalesByChannel(companyId: string, startDate: string, endDate: string): Promise<{
        label: string;
        total: number;
    }[]>;
    salesByChannel(companyId: string, startDate: string, endDate: string): Promise<{
        label: string;
        total: number;
        totalEmVendas: number;
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
    getKpis(companyId: string, period: Period, attendantId?: string): Promise<{
        novasConversas: number;
        novasConversasTotal: number;
        conversasAtivas: number;
        enviadas: number;
        recebidas: number;
        taxaResolucao: number;
        resolvidos: number;
        naFila: number;
    }>;
    getGraph(companyId: string, period: Period, attendantId?: string): Promise<{
        period: Period;
        data: {
            slot: number;
            total: number;
        }[];
    }>;
    getMovimentos(companyId: string, period: Period, attendantId?: string): Promise<{
        label: string;
        value: number;
        color: string;
    }[]>;
    getFunnel(companyId: string, attendantId?: string): Promise<{
        name: string;
        value: number;
        color: string;
    }[]>;
    getRecent(companyId: string, limit?: number, attendantId?: string): Promise<{
        id: number;
        nome: string;
        telefone: string | null;
        data: Date | null;
    }[]>;
    getTopAttendants(companyId: string, period: Period): Promise<{
        id: string;
        name: string;
        total: number;
    }[]>;
    getChannelsByPeriod(companyId: string, period: Period, attendantId?: string): Promise<{
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
    getFinanceiroKpis(companyId: string, start?: Date, end?: Date): Promise<{
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
    getFinanceiroEvolucao(companyId: string, start?: Date, end?: Date): Promise<{
        dia: string;
        receita: number;
        vendas: number;
    }[]>;
    getFinanceiroOrigens(companyId: string, start?: Date, end?: Date): Promise<{
        origem: string;
        receita: number;
        vendas: number;
    }[]>;
    getFinanceiroHistorico(companyId: string, start?: Date, end?: Date): Promise<{
        id: number;
        contactName: string | null;
        contactNumber: string | null;
        salePrice: string | null;
        origin: string | null;
        closedAt: Date | null;
    }[]>;
    getFinanceiroPerdas(companyId: string, start?: Date, end?: Date): Promise<{
        id: number;
        contactName: string | null;
        contactNumber: string | null;
        reason: string | null;
        lossProductName: string | null;
        closedAt: Date | null;
    }[]>;
};
//# sourceMappingURL=dashboard.service.d.ts.map