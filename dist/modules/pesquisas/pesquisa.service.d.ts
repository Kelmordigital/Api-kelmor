import { Research } from './pesquisa.db.schema';
export declare const pesquisaService: {
    list(companyId: string): Promise<{
        answers: {
            id: number;
            research_id: number;
            title: string;
            created_at: Date | null;
        }[];
        queues: {
            research_id: number;
            queue_id: number;
            name: string;
            color: string | null;
        }[];
        id: number;
        company_id: string;
        name: string;
        type: string;
        active: boolean;
        default_research: boolean;
        created_at: Date | null;
        updated_at: Date | null;
    }[]>;
    listActive(companyId: string): Promise<{
        id: number;
        company_id: string;
        name: string;
        type: string;
        active: boolean;
        default_research: boolean;
        created_at: Date | null;
        updated_at: Date | null;
    }[]>;
    create(companyId: string, payload: {
        name: string;
        type?: string;
        active?: boolean;
        default_research?: boolean;
        answers: string[];
        queue_ids?: number[];
    }): Promise<{
        type: string;
        id: number;
        name: string;
        created_at: Date | null;
        updated_at: Date | null;
        company_id: string;
        active: boolean;
        default_research: boolean;
    }>;
    update(id: number, companyId: string, payload: {
        name?: string;
        type?: string;
        active?: boolean;
        default_research?: boolean;
        answers?: string[];
        queue_ids?: number[];
    }): Promise<{
        id: number;
    }>;
    remove(id: number, companyId: string): Promise<boolean>;
    /** Pesquisa ativa vinculada à fila do ticket, se houver. */
    findActiveForQueue(queueId: number | null, companyId: string): Promise<{
        id: number;
        company_id: string;
        name: string;
        type: string;
        active: boolean;
        default_research: boolean;
        created_at: Date | null;
        updated_at: Date | null;
    } | null>;
    /** Envia a pergunta da pesquisa e cria o registro pendente de resposta. */
    sendSurveyQuestion(ticket: {
        id: number;
        company_id: string;
        contact_id: number;
        connection_id: number | null;
    }, research: Research): Promise<void>;
    tryRecordAnswer(companyId: string, contactId: number, messageBody: string): Promise<boolean>;
    getReport(companyId: string, params: {
        dateInit?: string;
        dateEnd?: string;
        userId?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        items: any[];
        total: number;
        company_users: any[];
    }>;
    getReportDrillDown(companyId: string, params: {
        answerId: number;
        dateInit?: string;
        dateEnd?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        tickets: any[];
        total: number;
    }>;
};
//# sourceMappingURL=pesquisa.service.d.ts.map