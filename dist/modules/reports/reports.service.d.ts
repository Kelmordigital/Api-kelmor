export declare const reportsService: {
    getTicketsUser(companyId: string, dateStartParam?: string, dateEndParam?: string): Promise<{
        id: string;
        name: string;
        total_tickets: number;
    }[]>;
    exportTicketsUserExcel(companyId: string, dateStartParam?: string, dateEndParam?: string): Promise<Buffer>;
    getClientTickets(companyId: string, dateStartParam?: string, dateEndParam?: string, page?: number, limit?: number): Promise<{
        items: {
            client: string;
            ticket_count: number;
        }[];
        count: number;
        pages: number;
    }>;
    exportClientTicketsExcel(companyId: string, dateStartParam?: string, dateEndParam?: string): Promise<Buffer>;
    getAverage(companyId: string, params: {
        dateInit?: string;
        dateEnd?: string;
        queueId?: number;
        userId?: string;
        connectionId?: number;
        page?: number;
        limit?: number;
        graph?: boolean;
    }): Promise<{
        day: string;
        time_opened: number;
        label_opened: string;
        time_closed: number;
        label_closed: string;
    }[]>;
    exportAverageExcel(companyId: string, params: {
        dateInit?: string;
        dateEnd?: string;
        queueId?: number;
        userId?: string;
        connectionId?: number;
    }): Promise<Buffer>;
};
//# sourceMappingURL=reports.service.d.ts.map