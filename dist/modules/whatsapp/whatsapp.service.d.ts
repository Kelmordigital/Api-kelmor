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
    sendTextToPhone(connectionId: number, phone: string, text: string): Promise<void>;
    getConversas(): Promise<any[]>;
    ensureConversa(phone: string, nome: string | null): Promise<void>;
    updateConversaStatus(phone: string, status: string): Promise<void>;
};
//# sourceMappingURL=whatsapp.service.d.ts.map