export declare const crmConfigService: {
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
    updateReason(id: number, companyId: string, reason: string, color?: string): Promise<{
        id: number;
        company_id: string;
        reason: string;
        color: string | null;
    }>;
    deleteReason(id: number, companyId: string): Promise<void>;
    listKeywords(companyId: string): Promise<{
        id: number;
        company_id: string;
        keyword: string;
        origin: string;
        created_at: Date | null;
    }[]>;
    createKeyword(companyId: string, keyword: string, origin: string): Promise<{
        origin: string;
        id: number;
        created_at: Date | null;
        company_id: string;
        keyword: string;
    }>;
    deleteKeyword(id: number, companyId: string): Promise<void>;
};
/**
 * Verifica se o texto da mensagem contém alguma palavra-chave cadastrada.
 * Retorna o nome da origem correspondente ou null se não houver match.
 */
export declare function matchKeywordOrigin(companyId: string, messageText: string): Promise<string | null>;
//# sourceMappingURL=crm-config.service.d.ts.map