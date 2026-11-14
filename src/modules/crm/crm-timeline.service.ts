import { NotFoundError } from '../../core/errors/http-errors';
import type { TimelineRepository } from './crm.repository';

export type TicketEvent = 'accepted' | 'transferred' | 'reopened' | 'returned_to_queue' | 'closed' | 'status_changed';

export type TimelineItem =
    | { type: 'note'; created_at: Date | null; user_name: string | null; body: string }
    | { type: 'tag'; created_at: Date | null; tag_name: string; tag_color: string }
    | { type: 'ticket_event'; created_at: Date | null; user_name: string | null; event: TicketEvent; ticket_id: number };

/**
 * RN-CRM-09: traduz uma transição de status (at_historic_tickets) num evento
 * nomeado. `status_changed` é a rede de segurança para transições novas.
 */
export function deriveTicketEvent(statusIdInit: number, statusIdEnd: number): TicketEvent {
    if (statusIdEnd === 2 && (statusIdInit === 1 || statusIdInit === 9)) return 'accepted';
    if (statusIdEnd === 2 && statusIdInit === 2) return 'transferred';
    if (statusIdEnd === 2 && statusIdInit === 3) return 'reopened';
    if (statusIdEnd === 1) return 'returned_to_queue';
    if (statusIdEnd === 3) return 'closed';
    return 'status_changed';
}

export class ContactNaoEncontradoError extends NotFoundError {
    constructor() { super('Contato não encontrado.'); }
}

/** Linha do tempo do contato: atendimentos, etiquetas e anotações, do mais recente ao mais antigo. */
export class TimelineService {
    constructor(private readonly repository: TimelineRepository) {}

    async getTimeline(contactId: number, companyId: string): Promise<TimelineItem[]> {
        await this.ensureContact(contactId, companyId);
        const [events, tags, notes] = await Promise.all([
            this.repository.ticketEvents(contactId, companyId),
            this.repository.tags(contactId, companyId),
            this.repository.notes(contactId, companyId),
        ]);
        const items: TimelineItem[] = [
            ...events.map((r): TimelineItem => ({
                type: 'ticket_event', created_at: r.created_at, user_name: r.user_name,
                event: deriveTicketEvent(r.status_id_init, r.status_id_end), ticket_id: r.ticket_id,
            })),
            ...tags.map((r): TimelineItem => ({ type: 'tag', created_at: r.created_at, tag_name: r.tag_name, tag_color: r.tag_color })),
            ...notes.map((r): TimelineItem => ({ type: 'note', created_at: r.created_at, user_name: r.user_name, body: r.body })),
        ];
        return items.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    }

    async addNote(contactId: number, companyId: string, userId: string, body: string): Promise<TimelineItem> {
        await this.ensureContact(contactId, companyId);
        const note = await this.repository.addNote(contactId, companyId, userId, body);
        return { type: 'note', created_at: note.created_at, user_name: note.user_name, body: note.body };
    }

    private async ensureContact(contactId: number, companyId: string) {
        if (!(await this.repository.contactExists(contactId, companyId))) throw new ContactNaoEncontradoError();
    }
}
