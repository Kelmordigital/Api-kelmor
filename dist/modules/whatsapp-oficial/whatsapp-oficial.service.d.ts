import { Connection } from '../atendimento/atendimento.db.schema';
export declare function buildTextPayload(to: string, text: string, replyToWamid?: string): {
    type: string;
    text: {
        body: string;
        preview_url: boolean;
    };
    messaging_product: "whatsapp";
    recipient_type: "individual";
    to: string;
    context?: {
        message_id: string;
    };
};
/** Botões interativos — a Cloud API aceita no máximo 3 opções. */
export declare function buildButtonsPayload(to: string, bodyText: string, buttons: {
    id: string;
    title: string;
}[]): {
    type: string;
    interactive: {
        type: string;
        body: {
            text: string;
        };
        action: {
            buttons: {
                type: string;
                reply: {
                    id: string;
                    title: string;
                };
            }[];
        };
    };
    messaging_product: "whatsapp";
    recipient_type: "individual";
    to: string;
    context?: {
        message_id: string;
    };
};
/** Lista interativa — usada quando há mais de 3 opções (limite: 10 linhas por seção). */
export declare function buildListPayload(to: string, bodyText: string, buttonLabel: string, rows: {
    id: string;
    title: string;
    description?: string;
}[], sectionTitle?: string): {
    type: string;
    interactive: {
        type: string;
        body: {
            text: string;
        };
        action: {
            button: string;
            sections: {
                title: string;
                rows: {
                    description?: string | undefined;
                    id: string;
                    title: string;
                }[];
            }[];
        };
    };
    messaging_product: "whatsapp";
    recipient_type: "individual";
    to: string;
    context?: {
        message_id: string;
    };
};
export declare function buildTemplatePayload(to: string, name: string, languageCode: string, components?: unknown[]): {
    type: string;
    template: {
        components?: unknown[] | undefined;
        name: string;
        language: {
            code: string;
        };
    };
    messaging_product: "whatsapp";
    recipient_type: "individual";
    to: string;
    context?: {
        message_id: string;
    };
};
/** Mídia por link público — a Meta baixa o arquivo a partir da URL informada. */
export declare function buildMediaPayload(to: string, mediaType: 'image' | 'video' | 'audio' | 'document', link: string, opts?: {
    caption?: string;
    filename?: string;
}): {
    type: "audio" | "image" | "video" | "document";
    messaging_product: "whatsapp";
    recipient_type: "individual";
    to: string;
    context?: {
        message_id: string;
    };
};
export declare const whatsappOficialService: {
    /** Localiza a conexão oficial pelo phone_number_id do webhook (cache Redis 4h). */
    findConnectionByPhoneNumberId(phoneNumberId: string): Promise<Connection | null>;
    getConnection(connectionId: number): Promise<Connection | null>;
    /**
     * POST /<phone_number_id>/messages. Retorna o wamid da mensagem enviada
     * (usado depois para casar os webhooks de status/ACK).
     */
    sendPayload(conn: Connection, payload: Record<string, unknown>): Promise<string | undefined>;
    sendText(conn: Connection, to: string, text: string, replyToWamid?: string): Promise<string | undefined>;
    sendMedia(conn: Connection, to: string, mediaType: "image" | "video" | "audio" | "document", link: string, opts?: {
        caption?: string;
        filename?: string;
    }): Promise<string | undefined>;
    sendTemplate(conn: Connection, to: string, name: string, languageCode?: string, components?: unknown[]): Promise<string | undefined>;
    /** Resolve a URL temporária de um media_id (o binário é baixado à parte, autenticado). */
    getMediaUrl(conn: Connection, mediaId: string): Promise<{
        url: string;
        mime_type?: string;
    } | null>;
    /**
     * Troca o code OAuth do Embedded Signup por waba_id + phone_number_id.
     * Três chamadas: oauth/access_token → debug_token → /<waba_id>/phone_numbers.
     */
    getWabaInfoWithOAuth(code: string): Promise<{
        wabaId: string;
        phoneNumberId: string;
    }>;
    /** Registra o número na Cloud API (idempotente — já registrado não é erro). */
    registerPhoneNumber(phoneNumberId: string, token: string): Promise<boolean>;
    getPhoneInfo(phoneNumberId: string, token: string): Promise<{
        display_phone_number?: string;
        verified_name?: string;
    } | null>;
    /**
     * Cria uma conexão oficial. Dois caminhos:
     *  - Embedded Signup: informa `code` (OAuth) → descobre WABA/telefone e usa WAB_USER_TOKEN
     *  - Manual: informa `wabaId` + `phoneNumberId` (+ `token` opcional, senão WAB_USER_TOKEN)
     */
    createConnection(params: {
        companyId: string;
        name?: string;
        code?: string;
        wabaId?: string;
        phoneNumberId?: string;
        token?: string;
    }): Promise<Connection>;
    listTemplates(conn: Connection): Promise<unknown[]>;
    createTemplate(conn: Connection, template: {
        name: string;
        language: string;
        category: "AUTHENTICATION" | "MARKETING" | "UTILITY";
        components: unknown[];
    }): Promise<unknown>;
    deleteTemplate(conn: Connection, name: string): Promise<unknown>;
};
//# sourceMappingURL=whatsapp-oficial.service.d.ts.map