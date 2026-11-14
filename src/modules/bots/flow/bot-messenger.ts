/** Para quem o bot fala, e em qual atendimento a conversa fica registrada. */
export interface Recipient {
    companyId: string;
    connectionId: number;
    phone: string;
    ticketId?: number;
    contactId?: number;
}

export interface MediaFile {
    url: string;
    mimetype: string;
    filename: string;
    sticker?: boolean;
}

/** Tudo o que o bot envia passa por aqui. */
export interface BotMessenger {
    /**
     * RN-FLX-09: texto para o contato, registrado no histórico do atendimento.
     * Falha no envio não interrompe o fluxo (fica no log).
     */
    text(to: Recipient, text: string): Promise<void>;
    /** Falha no envio interrompe o fluxo (a conversa fica com erro). */
    media(to: Recipient, file: MediaFile, caption?: string): Promise<void>;
    poll(to: Recipient, question: string, options: string[]): Promise<void>;
    contactCard(to: Recipient, name: string, phone: string): Promise<void>;
    /** Aviso para outro número (ex.: contato do rodízio); não entra no histórico. */
    notify(connectionId: number, phone: string, text: string): Promise<void>;
}

/** O que o messenger usa do WhatsApp. */
export interface WhatsAppSender {
    sendTextToPhone(connectionId: number, target: string, text: string): Promise<unknown>;
    sendMediaToPhone(connectionId: number, target: string, media: { path: string; mimetype: string; originalname: string; sticker?: boolean }, caption?: string): Promise<unknown>;
    sendPollToPhone(connectionId: number, target: string, question: string, options: string[]): Promise<unknown>;
    sendContactCardToPhone(connectionId: number, target: string, name: string, phone: string): Promise<unknown>;
}

/** Grava no atendimento uma mensagem enviada pelo bot (sem atendente). */
export type HistoryWriter = (ticketId: number, contactId: number, body: string, companyId: string) => Promise<void>;

export class WhatsAppBotMessenger implements BotMessenger {
    constructor(
        private readonly whatsapp: () => Promise<WhatsAppSender>,
        private readonly history: HistoryWriter,
    ) {}

    async text(to: Recipient, text: string): Promise<void> {
        const body = text.trim();
        if (!body) return;
        if (to.ticketId && to.contactId) {
            await this.history(to.ticketId, to.contactId, body, to.companyId)
                .catch((err: Error) => console.error('[ChatbotExecutor] Falha ao salvar mensagem do bot:', err.message));
        }
        await (await this.whatsapp()).sendTextToPhone(to.connectionId, to.phone, body)
            .catch((err: Error) => console.error('[ChatbotExecutor] Falha ao enviar mensagem:', err.message));
    }

    async media(to: Recipient, file: MediaFile, caption?: string): Promise<void> {
        await (await this.whatsapp()).sendMediaToPhone(to.connectionId, to.phone, {
            path: file.url, mimetype: file.mimetype, originalname: file.filename, ...(file.sticker ? { sticker: true } : {}),
        }, caption);
    }

    async poll(to: Recipient, question: string, options: string[]): Promise<void> {
        await (await this.whatsapp()).sendPollToPhone(to.connectionId, to.phone, question, options);
    }

    async contactCard(to: Recipient, name: string, phone: string): Promise<void> {
        await (await this.whatsapp()).sendContactCardToPhone(to.connectionId, to.phone, name, phone);
    }

    async notify(connectionId: number, phone: string, text: string): Promise<void> {
        await (await this.whatsapp()).sendTextToPhone(connectionId, phone, text)
            .catch((err: Error) => console.error('[ChatbotExecutor] Falha ao notificar rodízio:', err.message));
    }
}
