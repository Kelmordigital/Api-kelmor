import { Connection } from '../atendimento/atendimento.db.schema';
type WabMessage = {
    from: string;
    id: string;
    timestamp?: string;
    type?: string;
    text?: {
        body?: string;
    };
    image?: {
        id?: string;
        caption?: string;
        mime_type?: string;
    };
    video?: {
        id?: string;
        caption?: string;
        mime_type?: string;
    };
    audio?: {
        id?: string;
        mime_type?: string;
    };
    sticker?: {
        id?: string;
        mime_type?: string;
    };
    document?: {
        id?: string;
        caption?: string;
        filename?: string;
        mime_type?: string;
    };
    location?: {
        latitude?: number;
        longitude?: number;
        name?: string;
    };
    contacts?: unknown[];
    reaction?: {
        emoji?: string;
    };
    button?: {
        text?: string;
        payload?: string;
    };
    interactive?: {
        type?: string;
        button_reply?: {
            id?: string;
            title?: string;
        };
        list_reply?: {
            id?: string;
            title?: string;
        };
    };
    referral?: {
        source_type?: string;
        source_url?: string;
        headline?: string;
    };
};
type WabStatus = {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed' | string;
    recipient_id?: string;
    errors?: {
        code?: number;
        title?: string;
        message?: string;
    }[];
};
type WabValue = {
    messaging_product?: string;
    metadata?: {
        display_phone_number?: string;
        phone_number_id?: string;
    };
    contacts?: {
        profile?: {
            name?: string;
        };
        wa_id?: string;
    }[];
    messages?: WabMessage[];
    statuses?: WabStatus[];
};
/** Mapeia o status da Meta para a escala de ack usada na UI. */
export declare function mapStatusToAck(status: string): number;
/** Extrai texto exibível + referência de mídia de uma mensagem da Cloud API. */
export declare function extractMessageContent(msg: WabMessage): {
    body: string;
    mediaId?: string;
    mediaType?: string;
    mimeType?: string;
    filename?: string;
};
/** Origem do ticket: rastreio de anúncio (referral) ou padrão da base. */
export declare function resolveOrigin(msg: WabMessage): string;
export declare const whatsappOficialWebhookService: {
    /** Entrada única: roteia todas as mudanças do corpo enviado pela Meta. */
    handleWebhookBody(body: unknown): Promise<void>;
    handleIncomingMessage(value: WabValue, msg: WabMessage): Promise<void>;
    /** Baixa a mídia (2 etapas: resolve URL → download autenticado) e serve via /uploads. */
    downloadMedia(conn: Connection, mediaId: string, wamid: string, mimeType?: string, filename?: string): Promise<string | null>;
    handleStatuses(value: WabValue): Promise<void>;
};
export {};
//# sourceMappingURL=whatsapp-oficial-webhook.service.d.ts.map