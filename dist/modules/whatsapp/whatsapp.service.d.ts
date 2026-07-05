export declare const whatsappService: {
    getStatus(connectionId?: number): Promise<{
        status: string;
        qr?: string;
    }>;
    connect(connectionId?: number): Promise<void>;
    disconnect(connectionId?: number): Promise<void>;
    handleConnectionUpdate(connectionId: number, data: {
        type: string;
        qrCode?: string;
        serializedId?: string;
        code?: number;
        reason?: string;
    }): Promise<void>;
    handleConnectionError(connectionId: number, payload: unknown): Promise<void>;
    handleMessagesWebhook(connectionId: number, payload: unknown): Promise<void>;
    getChats(page?: number, limit?: number): Promise<any[]>;
    getMessages(phone: string, page?: number, limit?: number): Promise<any[]>;
    sendMessage(phone: string, text: string): Promise<any>;
    /** Envia texto para um contato username-only (sem número), roteando pelo LID. */
    sendMessageViaLid(lid: string, text: string, connectionId?: number): Promise<any>;
    /**
     * Envia texto para um destino que pode ser um número ou um LID.
     * Se `target` vier no formato "lid:<id>", roteia pelo LID (contato username-only);
     * caso contrário trata como número normal. Não quebra chamadores que passam número puro.
     */
    sendTextToPhone(connectionId: number, target: string, text: string): Promise<void>;
    getConversas(): Promise<any[]>;
    ensureConversa(phone: string, nome: string | null): Promise<void>;
    updateConversaStatus(phone: string, status: string): Promise<void>;
};
//# sourceMappingURL=whatsapp.service.d.ts.map