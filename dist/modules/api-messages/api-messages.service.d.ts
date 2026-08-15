export declare class ApiMessagesDisabledError extends Error {
    constructor();
}
export declare class ConnectionNotFoundError extends Error {
    constructor();
}
export declare const apiMessagesService: {
    /** Gera (ou substitui) a chave da empresa. Retorna o valor em texto puro — única vez que ele existe. */
    generateKey(companyId: string): Promise<{
        key: string;
        prefix: string;
    }>;
    getKeyStatus(companyId: string): Promise<{
        active: boolean;
        prefix: string | null;
        createdAt: Date | null;
    }>;
    revokeKey(companyId: string): Promise<void>;
    /** Resolve a empresa dona de uma chave ativa (não revogada), ou null se inválida. */
    resolveCompanyByKey(rawKey: string): Promise<string | null>;
    /**
     * Envia uma mensagem transacional e grava o log de auditoria sempre. Se
     * `create_ticket_api_msg` estiver ligado, também vincula ao histórico de
     * conversa do contato (ticket existente ou um novo já fechado) — ver
     * `ticketService.attachExternalMessage`.
     */
    sendMessage(companyId: string, params: {
        connectionId: number;
        number: string;
        message: string;
    }): Promise<{
        ticketId: number | null;
    }>;
};
//# sourceMappingURL=api-messages.service.d.ts.map