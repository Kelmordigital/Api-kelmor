import type { AtMessage, Contact, Ticket } from './atendimento.db.schema';

/** Tempo real: mesmos eventos e payloads de sempre. */
export interface AtendimentoEvents {
    ticketCreated(companyId: string, ticket: Ticket): void;
    ticketUpdated(companyId: string, ticket: Ticket): void;
    ticketClosed(companyId: string, ticketId: number): void;
    messageCreated(companyId: string, message: AtMessage, ticketId: number): void;
}

/** Envio pelo WhatsApp (implementado pelo módulo whatsapp). */
export interface WhatsappSender {
    sendTextToPhone(connectionId: number, target: string, text: string): Promise<{ wabMessageId?: string } | void>;
    sendMessage(phone: string, text: string): Promise<unknown>;
    sendMessageViaLid(lid: string, text: string, connectionId?: number): Promise<unknown>;
    isConnected(connectionId: number): Promise<boolean>;
}

export interface SaveMessageOptions { userId?: string; mediaType?: string; mediaUrl?: string; mediaWaveform?: number[]; mediaSeconds?: number }

/** Gravar mensagem no histórico do atendimento. */
export interface MessageRecorder {
    save(ticketId: number, contactId: number | null, body: string, fromMe: boolean, companyId: string, opts?: SaveMessageOptions): Promise<AtMessage>;
}

/** Contato canônico a partir do que chega do WhatsApp/API. */
export interface ContactResolver {
    findOrCreate(companyId: string, number?: string | null, name?: string, lid?: string | null, waUsername?: string | null): Promise<Contact>;
    refreshNameFromPushName(contact: Contact, pushName: string, fromMe: boolean): Promise<Contact>;
}

/** Conversa em aberto do contato (mensagem nova, API transacional). */
export interface ConversationTickets {
    findOrCreateOpen(companyId: string, contactId: number, connectionId?: number, serializedId?: string, origin?: string): Promise<{ ticket: Ticket; created: boolean }>;
    attachExternalMessage(companyId: string, contactId: number, connectionId: number, body: string): Promise<Ticket>;
}

/** O que o bot precisa do atendimento. */
export interface BotTicketGateway {
    routeToQueue(ticketId: number, companyId: string, queueId: number): Promise<Ticket | null>;
    isInBotFlow(ticketId: number, companyId: string): Promise<boolean>;
}

export interface DefaultBotLookup { hasDefaultActiveBot(companyId: string): Promise<boolean> }
