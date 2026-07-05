export declare const crmReportsService: {
    salesMade(companyId: string, params: {
        dateInit?: string;
        dateEnd?: string;
        userId?: string;
        queueId?: number;
        page?: number;
        perPage?: number;
    }): Promise<{
        salesMade: any[];
        count: number;
        totalPages: number;
        page: number;
        totalValue: number;
        avgValue: number;
    }>;
    salesNotMade(companyId: string, params: {
        dateInit?: string;
        dateEnd?: string;
        userId?: string;
        queueId?: number;
        page?: number;
        perPage?: number;
    }): Promise<{
        salesMade: any[];
        count: number;
        totalPages: number;
        page: number;
        totalValue: number;
        avgValue: number;
    }>;
    reasons(companyId: string): Promise<{
        id: number;
        reason: string;
        color: string | null;
    }[]>;
    channels(companyId: string): Promise<{
        channel: string | null;
    }[]>;
    updateSale(ticketId: number, companyId: string, payload: {
        isSale: boolean;
        salePrice?: string | null;
        reasonId?: number | null;
    }): Promise<boolean>;
};
//# sourceMappingURL=crm-reports.service.d.ts.map