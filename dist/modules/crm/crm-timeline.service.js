"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmTimelineService = exports.ContactNaoEncontradoError = void 0;
exports.deriveTicketEvent = deriveTicketEvent;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const etiqueta_db_schema_1 = require("../etiquetas/etiqueta.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
/**
 * Traduz uma transição de status (at_historic_tickets) num evento nomeado pra
 * timeline. `status_changed` é um fallback de segurança — nenhuma transição
 * conhecida hoje deveria cair nele, mas é melhor que sumir a linha do
 * histórico se uma transição nova aparecer no futuro.
 */
function deriveTicketEvent(statusIdInit, statusIdEnd) {
    if (statusIdEnd === 2 && (statusIdInit === 1 || statusIdInit === 9))
        return 'accepted';
    if (statusIdEnd === 2 && statusIdInit === 2)
        return 'transferred';
    if (statusIdEnd === 2 && statusIdInit === 3)
        return 'reopened';
    if (statusIdEnd === 1)
        return 'returned_to_queue';
    if (statusIdEnd === 3)
        return 'closed';
    return 'status_changed';
}
class ContactNaoEncontradoError extends Error {
    constructor() { super('Contato não encontrado.'); }
}
exports.ContactNaoEncontradoError = ContactNaoEncontradoError;
async function ensureContactInCompany(contactId, companyId) {
    const [contact] = await client_1.db.select({ id: atendimento_db_schema_1.contacts.id }).from(atendimento_db_schema_1.contacts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, contactId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId)))
        .limit(1);
    if (!contact)
        throw new ContactNaoEncontradoError();
}
exports.crmTimelineService = {
    async getTimeline(contactId, companyId) {
        await ensureContactInCompany(contactId, companyId);
        const [ticketEventRows, tagRows, noteRows] = await Promise.all([
            client_1.db.select({
                created_at: atendimento_db_schema_1.historic_tickets.created_at,
                status_id_init: atendimento_db_schema_1.historic_tickets.status_id_init,
                status_id_end: atendimento_db_schema_1.historic_tickets.status_id_end,
                ticket_id: atendimento_db_schema_1.historic_tickets.ticket_id,
                user_name: auth_schema_1.users.name,
            })
                .from(atendimento_db_schema_1.historic_tickets)
                .innerJoin(atendimento_db_schema_1.tickets, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, atendimento_db_schema_1.historic_tickets.ticket_id))
                .leftJoin(auth_schema_1.users, (0, drizzle_orm_1.eq)(auth_schema_1.users.id, atendimento_db_schema_1.historic_tickets.user_id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, contactId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId))),
            client_1.db.select({
                created_at: etiqueta_db_schema_1.contactEtiquetas.created_at,
                tag_name: etiqueta_db_schema_1.etiquetas.name,
                tag_color: etiqueta_db_schema_1.etiquetas.color,
            })
                .from(etiqueta_db_schema_1.contactEtiquetas)
                .innerJoin(etiqueta_db_schema_1.etiquetas, (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.id, etiqueta_db_schema_1.contactEtiquetas.etiqueta_id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.contact_id, String(contactId)), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId))),
            client_1.db.select({
                created_at: atendimento_db_schema_1.crm_contact_notes.created_at,
                body: atendimento_db_schema_1.crm_contact_notes.body,
                user_name: auth_schema_1.users.name,
            })
                .from(atendimento_db_schema_1.crm_contact_notes)
                .leftJoin(auth_schema_1.users, (0, drizzle_orm_1.eq)(auth_schema_1.users.id, atendimento_db_schema_1.crm_contact_notes.user_id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_contact_notes.contact_id, contactId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_contact_notes.company_id, companyId))),
        ]);
        const items = [
            ...ticketEventRows.map((r) => ({
                type: 'ticket_event',
                created_at: r.created_at,
                user_name: r.user_name,
                event: deriveTicketEvent(Number(r.status_id_init), Number(r.status_id_end)),
                ticket_id: r.ticket_id,
            })),
            ...tagRows.map((r) => ({
                type: 'tag',
                created_at: r.created_at,
                tag_name: r.tag_name,
                tag_color: r.tag_color,
            })),
            ...noteRows.map((r) => ({
                type: 'note',
                created_at: r.created_at,
                user_name: r.user_name,
                body: r.body,
            })),
        ];
        items.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
        return items;
    },
    async addNote(contactId, companyId, userId, body) {
        await ensureContactInCompany(contactId, companyId);
        const [created] = await client_1.db.insert(atendimento_db_schema_1.crm_contact_notes)
            .values({ company_id: companyId, contact_id: contactId, user_id: userId, body })
            .returning();
        const [author] = await client_1.db.select({ name: auth_schema_1.users.name }).from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId)).limit(1);
        return { type: 'note', created_at: created.created_at, user_name: author?.name ?? null, body: created.body };
    },
};
//# sourceMappingURL=crm-timeline.service.js.map