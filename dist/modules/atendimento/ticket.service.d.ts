import { type SQL } from 'drizzle-orm';
import { Ticket } from './atendimento.db.schema';
import { getCompanyPermissions } from '../configuracao-geral/configuracao-geral.service';
export declare class AtendenteNaoElegivelError extends Error {
    constructor();
}
export declare class TransferenciaParaSiMesmoError extends Error {
    constructor();
}
/**
 * Constrói a condição de visibilidade de tickets para um "viewer".
 * - admin/superAdmin ou empresa com show_all_tickets → sem restrição (undefined).
 * - demais: vê ticket cuja fila ele pertence, OU sem fila, OU atribuído a ele.
 *   Se not_show_pending_ticket_without_queue: oculta pendentes (status 1) sem fila.
 */
export declare function ticketVisibilityCondition(companyId: string, userId: string, profileTag: string): Promise<SQL | undefined>;
export interface FunilCard {
    id: number;
    funil_stage: string;
    contact_id: number;
    contact_name: string;
    contact_number: string | null;
    contact_profile_pic_url: string | null;
    status_id: number;
    created_at: Date | null;
}
/** O bot só processa mensagens enquanto o ticket está em status Bot (9) — status_id é a única fonte de roteamento. */
export declare function shouldRunBot(ticket: {
    status_id: number;
}): boolean;
export declare const ticketService: {
    /** Busca o ticket aberto do contato (mesma conexão), sem criar um novo. */
    findOpenTicket(companyId: string, contactId: number, connectionId?: number): Promise<Ticket | null>;
    findOrCreateOpen(companyId: string, contactId: number, connectionId?: number, serializedId?: string, origin?: string): Promise<{
        ticket: Ticket;
        created: boolean;
    }>;
    get(ticketId: number, companyId: string): Promise<Ticket | null>;
    /**
     * Histórico de atendimentos de um contato — todos os tickets (aberto e
     * fechados) para montar a timeline consolidada na tela de chat, sem
     * precisar reabrir/reaproveitar o ticket antigo (cada um continua sendo
     * um registro definitivo, preservando venda/ocorrência individuais).
     */
    listByContact(contactId: number, companyId: string): Promise<Array<Ticket & {
        attendant_name: string | null;
        closed_by_name: string | null;
    }>>;
    list(companyId: string, filters?: {
        statusIds?: number[];
        attendantId?: string;
        connectionId?: number;
        queueId?: number;
        /** Restringe a "meus": tickets onde sou atendente OU quem fechou. */
        mineUserId?: string;
        orderBy?: "ASC" | "DESC";
        search?: string;
        dateInit?: string;
        dateEnd?: string;
        limit?: number;
        offset?: number;
        /** Quando presente, aplica visibilidade por fila para não-admins. */
        viewer?: {
            userId: string;
            profileTag: string;
        };
    }): Promise<Ticket[]>;
    count(companyId: string, userId: string, profileTag: string): Promise<{
        pending: number;
        open: number;
        closed: number;
    }>;
    /** Atendente assume o ticket (Pendente=1 ou Bot=9 → Aberto=2). Update atômico condicional. */
    assignAttendant(ticketId: number, userId: string, companyId: string): Promise<Ticket>;
    _sendOpeningMessages(ticket: Ticket, userId: string, companyId: string, perms: Awaited<ReturnType<typeof getCompanyPermissions>>): Promise<void>;
    /**
     * Roteia um ticket para uma fila (usado pelo chatbot). Seta `queue_id` e, se a
     * fila tiver distribuição automática e houver atendente elegível/online, atribui
     * (status 1 → 2). Sem atendente elegível, o ticket fica pendente na fila.
     */
    routeToQueue(ticketId: number, companyId: string, queueId: number): Promise<Ticket | null>;
    _sendQueueGreeting(ticket: Ticket, queueId: number): Promise<void>;
    /** Devolve o ticket para a fila (2 → 1). Zera o atendente. */
    returnToQueue(ticketId: number, userId: string, companyId: string): Promise<Ticket>;
    /** Reabre um ticket finalizado (3 → 2). Verifica se não há outro aberto para o mesmo contato. */
    reopen(ticketId: number, userId: string, companyId: string): Promise<Ticket>;
    /** Transfere o ticket para outro atendente dentro de uma fila. Cria mensagem interna de transferência. */
    transfer(ticketId: number, fromUserId: string, toUserId: string, companyId: string, queueId: number): Promise<Ticket>;
    _sendTransferMessage(ticket: Ticket, companyId: string, fromName: string | undefined, toName: string): Promise<void>;
    /** Alterna fixação do ticket no topo da lista. */
    togglePin(ticketId: number, companyId: string): Promise<Ticket>;
    closeTicket(ticketId: number, userId: string, companyId: string, opts?: {
        ocurrence?: string;
        service_not_made?: boolean;
        sendGoodbye?: boolean;
    }): Promise<Ticket>;
    /**
     * Fechamento alternativo: em vez de despedida, pergunta a pesquisa de
     * satisfação. O ticket NÃO fecha ainda — vai para status 7 (Realizando
     * Pesquisa) e só vira Fechado (3) de fato quando o cliente responder
     * (ver pesquisaService.tryRecordAnswer → finalizeAfterResearch). É uma
     * alternativa exclusiva à despedida, nunca as duas juntas.
     */
    closeTicketWithResearch(ticketId: number, userId: string, companyId: string): Promise<Ticket>;
    /** Fecha de fato o ticket depois que a pesquisa de satisfação foi respondida (status 7 → 3). */
    finalizeAfterResearch(ticketId: number, companyId: string): Promise<void>;
    /**
     * Envia a mensagem de despedida ao fechar o ticket.
     *
     * @param sendGoodbye  Escolha explícita do fechamento manual:
     *   - true      → envia, ignorando a permissão global
     *   - false     → não envia
     *   - undefined → comportamento automático (respeita send_ticket_goodbye_msg)
     */
    _sendClosingMessage(ticket: Ticket, companyId: string, sendGoodbye: boolean | undefined, userId: string): Promise<void>;
    registerSale(ticketId: number, companyId: string, payload: {
        isSale: boolean;
        saleAmount?: string;
        lossReasonId?: number;
        lossProductName?: string;
    }): Promise<Ticket>;
    /** @deprecated use assignAttendant — mantido para compatibilidade */
    updateStatus(ticketId: number, statusId: number, companyId: string): Promise<Ticket>;
    createFunilLead(companyId: string, payload: {
        name?: string;
        phone?: string;
        email?: string;
        notes?: string;
        funil_stage?: string;
    }): Promise<FunilCard>;
    getFunilCards(companyId: string, search?: string): Promise<FunilCard[]>;
    updateFunilStage(ticketId: number, stage: string, companyId: string): Promise<Ticket>;
    statusByContact(companyId: string, params: {
        dateInit?: string;
        dateEnd?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        items: any[];
        total: number;
    }>;
    listAttendants(companyId: string): Promise<{
        id: string;
        name: string;
        email: string;
    }[]>;
};
//# sourceMappingURL=ticket.service.d.ts.map