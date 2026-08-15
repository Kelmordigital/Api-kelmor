export type TicketEvent = 'accepted' | 'transferred' | 'reopened' | 'returned_to_queue' | 'closed' | 'status_changed';
export type TimelineItem = {
    type: 'note';
    created_at: Date | null;
    user_name: string | null;
    body: string;
} | {
    type: 'tag';
    created_at: Date | null;
    tag_name: string;
    tag_color: string;
} | {
    type: 'ticket_event';
    created_at: Date | null;
    user_name: string | null;
    event: TicketEvent;
    ticket_id: number;
};
/**
 * Traduz uma transição de status (at_historic_tickets) num evento nomeado pra
 * timeline. `status_changed` é um fallback de segurança — nenhuma transição
 * conhecida hoje deveria cair nele, mas é melhor que sumir a linha do
 * histórico se uma transição nova aparecer no futuro.
 */
export declare function deriveTicketEvent(statusIdInit: number, statusIdEnd: number): TicketEvent;
export declare class ContactNaoEncontradoError extends Error {
    constructor();
}
export declare const crmTimelineService: {
    getTimeline(contactId: number, companyId: string): Promise<TimelineItem[]>;
    addNote(contactId: number, companyId: string, userId: string, body: string): Promise<TimelineItem>;
};
//# sourceMappingURL=crm-timeline.service.d.ts.map