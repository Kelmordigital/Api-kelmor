import { eq, and } from 'drizzle-orm';
import { db } from '../../database/client';
import {
    contacts, tickets, historic_tickets, crm_contact_notes,
} from '../atendimento/atendimento.db.schema';
import { etiquetas, contactEtiquetas } from '../etiquetas/etiqueta.db.schema';
import { users } from '../auth/auth.schema';

export type TicketEvent = 'accepted' | 'transferred' | 'reopened' | 'returned_to_queue' | 'closed' | 'status_changed';

export type TimelineItem =
    | { type: 'note'; created_at: Date | null; user_name: string | null; body: string }
    | { type: 'tag'; created_at: Date | null; tag_name: string; tag_color: string }
    | { type: 'ticket_event'; created_at: Date | null; user_name: string | null; event: TicketEvent; ticket_id: number };

/**
 * Traduz uma transição de status (at_historic_tickets) num evento nomeado pra
 * timeline. `status_changed` é um fallback de segurança — nenhuma transição
 * conhecida hoje deveria cair nele, mas é melhor que sumir a linha do
 * histórico se uma transição nova aparecer no futuro.
 */
export function deriveTicketEvent(statusIdInit: number, statusIdEnd: number): TicketEvent {
    if (statusIdEnd === 2 && (statusIdInit === 1 || statusIdInit === 9)) return 'accepted';
    if (statusIdEnd === 2 && statusIdInit === 2) return 'transferred';
    if (statusIdEnd === 2 && statusIdInit === 3) return 'reopened';
    if (statusIdEnd === 1) return 'returned_to_queue';
    if (statusIdEnd === 3) return 'closed';
    return 'status_changed';
}

export class ContactNaoEncontradoError extends Error {
    constructor() { super('Contato não encontrado.'); }
}

async function ensureContactInCompany(contactId: number, companyId: string) {
    const [contact] = await db.select({ id: contacts.id }).from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.company_id, companyId)))
        .limit(1);
    if (!contact) throw new ContactNaoEncontradoError();
}

export const crmTimelineService = {

    async getTimeline(contactId: number, companyId: string): Promise<TimelineItem[]> {
        await ensureContactInCompany(contactId, companyId);

        const [ticketEventRows, tagRows, noteRows] = await Promise.all([
            db.select({
                created_at: historic_tickets.created_at,
                status_id_init: historic_tickets.status_id_init,
                status_id_end: historic_tickets.status_id_end,
                ticket_id: historic_tickets.ticket_id,
                user_name: users.name,
            })
                .from(historic_tickets)
                .innerJoin(tickets, eq(tickets.id, historic_tickets.ticket_id))
                .leftJoin(users, eq(users.id, historic_tickets.user_id))
                .where(and(eq(tickets.contact_id, contactId), eq(tickets.company_id, companyId))),

            db.select({
                created_at: contactEtiquetas.created_at,
                tag_name: etiquetas.name,
                tag_color: etiquetas.color,
            })
                .from(contactEtiquetas)
                .innerJoin(etiquetas, eq(etiquetas.id, contactEtiquetas.etiqueta_id))
                .where(and(eq(contactEtiquetas.contact_id, String(contactId)), eq(etiquetas.company_id, companyId))),

            db.select({
                created_at: crm_contact_notes.created_at,
                body: crm_contact_notes.body,
                user_name: users.name,
            })
                .from(crm_contact_notes)
                .leftJoin(users, eq(users.id, crm_contact_notes.user_id))
                .where(and(eq(crm_contact_notes.contact_id, contactId), eq(crm_contact_notes.company_id, companyId))),
        ]);

        const items: TimelineItem[] = [
            ...ticketEventRows.map((r): TimelineItem => ({
                type: 'ticket_event',
                created_at: r.created_at,
                user_name: r.user_name,
                event: deriveTicketEvent(Number(r.status_id_init), Number(r.status_id_end)),
                ticket_id: r.ticket_id,
            })),
            ...tagRows.map((r): TimelineItem => ({
                type: 'tag',
                created_at: r.created_at,
                tag_name: r.tag_name,
                tag_color: r.tag_color,
            })),
            ...noteRows.map((r): TimelineItem => ({
                type: 'note',
                created_at: r.created_at,
                user_name: r.user_name,
                body: r.body,
            })),
        ];

        items.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
        return items;
    },

    async addNote(contactId: number, companyId: string, userId: string, body: string): Promise<TimelineItem> {
        await ensureContactInCompany(contactId, companyId);

        const [created] = await db.insert(crm_contact_notes)
            .values({ company_id: companyId, contact_id: contactId, user_id: userId, body })
            .returning();

        const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);

        return { type: 'note', created_at: created.created_at, user_name: author?.name ?? null, body: created.body };
    },
};
