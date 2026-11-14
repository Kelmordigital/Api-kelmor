import { and, desc, eq, gte, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../../database/client';
import type { Pagination } from '../../core/http/pagination';
import {
    contacts, crm_contact_notes, crm_keywords, crm_sales_reasons, historic_tickets, queues, tickets,
} from '../atendimento/atendimento.db.schema';
import { etiquetas, contactEtiquetas } from '../etiquetas/etiqueta.db.schema';
import { users } from '../auth/auth.schema';
import type { CreateKeywordInput, CreateReasonInput, UpdateReasonInput } from './crm.dto';
import { endOfDayBR, startOfDayBR } from '../../core/dates/br-day';

export type SalesReason = typeof crm_sales_reasons.$inferSelect;
export type OriginKeyword = typeof crm_keywords.$inferSelect;

/** Motivos de não venda e palavras-chave de origem da empresa. */
export interface CrmConfigRepository {
    listReasons(companyId: string): Promise<SalesReason[]>;
    createReason(companyId: string, input: CreateReasonInput): Promise<SalesReason>;
    updateReason(id: number, companyId: string, input: UpdateReasonInput): Promise<SalesReason | null>;
    deleteReason(id: number, companyId: string): Promise<void>;
    listKeywords(companyId: string): Promise<OriginKeyword[]>;
    createKeyword(companyId: string, input: CreateKeywordInput): Promise<OriginKeyword>;
    deleteKeyword(id: number, companyId: string): Promise<void>;
}

export class DrizzleCrmConfigRepository implements CrmConfigRepository {
    constructor(private readonly db: DB) {}

    listReasons(companyId: string): Promise<SalesReason[]> {
        return this.db.select().from(crm_sales_reasons).where(eq(crm_sales_reasons.company_id, companyId)).orderBy(crm_sales_reasons.id);
    }

    async createReason(companyId: string, input: CreateReasonInput) {
        const [row] = await this.db.insert(crm_sales_reasons)
            .values({ company_id: companyId, reason: input.reason, color: input.color ?? null }).returning();
        return row;
    }

    async updateReason(id: number, companyId: string, input: UpdateReasonInput) {
        const where = and(eq(crm_sales_reasons.id, id), eq(crm_sales_reasons.company_id, companyId));
        if (Object.keys(input).length === 0) {
            const [row] = await this.db.select().from(crm_sales_reasons).where(where);
            return row ?? null;
        }
        const [row] = await this.db.update(crm_sales_reasons).set(input).where(where).returning();
        return row ?? null;
    }

    async deleteReason(id: number, companyId: string) {
        await this.db.delete(crm_sales_reasons).where(and(eq(crm_sales_reasons.id, id), eq(crm_sales_reasons.company_id, companyId)));
    }

    listKeywords(companyId: string): Promise<OriginKeyword[]> {
        return this.db.select().from(crm_keywords).where(eq(crm_keywords.company_id, companyId)).orderBy(crm_keywords.id);
    }

    async createKeyword(companyId: string, input: CreateKeywordInput) {
        const [row] = await this.db.insert(crm_keywords).values({ company_id: companyId, ...input }).returning();
        return row;
    }

    async deleteKeyword(id: number, companyId: string) {
        await this.db.delete(crm_keywords).where(and(eq(crm_keywords.id, id), eq(crm_keywords.company_id, companyId)));
    }
}

export interface TicketEventRow { created_at: Date | null; status_id_init: number; status_id_end: number; ticket_id: number; user_name: string | null }
export interface TagRow { created_at: Date | null; tag_name: string; tag_color: string }
export interface NoteRow { created_at: Date | null; body: string; user_name: string | null }

/** Histórico do contato: eventos dos tickets, etiquetas e anotações. */
export interface TimelineRepository {
    contactExists(contactId: number, companyId: string): Promise<boolean>;
    ticketEvents(contactId: number, companyId: string): Promise<TicketEventRow[]>;
    tags(contactId: number, companyId: string): Promise<TagRow[]>;
    notes(contactId: number, companyId: string): Promise<NoteRow[]>;
    addNote(contactId: number, companyId: string, userId: string, body: string): Promise<NoteRow>;
}

export class DrizzleTimelineRepository implements TimelineRepository {
    constructor(private readonly db: DB) {}

    async contactExists(contactId: number, companyId: string) {
        const [row] = await this.db.select({ id: contacts.id }).from(contacts)
            .where(and(eq(contacts.id, contactId), eq(contacts.company_id, companyId))).limit(1);
        return Boolean(row);
    }

    async ticketEvents(contactId: number, companyId: string) {
        const rows = await this.db.select({
            created_at: historic_tickets.created_at, status_id_init: historic_tickets.status_id_init,
            status_id_end: historic_tickets.status_id_end, ticket_id: historic_tickets.ticket_id, user_name: users.name,
        })
            .from(historic_tickets)
            .innerJoin(tickets, eq(tickets.id, historic_tickets.ticket_id))
            .leftJoin(users, eq(users.id, historic_tickets.user_id))
            .where(and(eq(tickets.contact_id, contactId), eq(tickets.company_id, companyId)));
        return rows.map((r) => ({ ...r, status_id_init: Number(r.status_id_init), status_id_end: Number(r.status_id_end) }));
    }

    tags(contactId: number, companyId: string): Promise<TagRow[]> {
        return this.db.select({ created_at: contactEtiquetas.created_at, tag_name: etiquetas.name, tag_color: etiquetas.color })
            .from(contactEtiquetas)
            .innerJoin(etiquetas, eq(etiquetas.id, contactEtiquetas.etiqueta_id))
            .where(and(eq(contactEtiquetas.contact_id, String(contactId)), eq(etiquetas.company_id, companyId)));
    }

    notes(contactId: number, companyId: string): Promise<NoteRow[]> {
        return this.db.select({ created_at: crm_contact_notes.created_at, body: crm_contact_notes.body, user_name: users.name })
            .from(crm_contact_notes)
            .leftJoin(users, eq(users.id, crm_contact_notes.user_id))
            .where(and(eq(crm_contact_notes.contact_id, contactId), eq(crm_contact_notes.company_id, companyId)));
    }

    async addNote(contactId: number, companyId: string, userId: string, body: string) {
        const [created] = await this.db.insert(crm_contact_notes)
            .values({ company_id: companyId, contact_id: contactId, user_id: userId, body }).returning();
        const [author] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
        return { created_at: created.created_at, body: created.body, user_name: author?.name ?? null };
    }
}

export interface SalesFilter {
    dateInit?: string;
    dateEnd?: string;
    userId?: string;
    queueId?: number;
}

export interface SaleRow {
    id: number;
    origin: string | null;
    sale_price: string | null;
    created_at: Date | null;
    updated_at: Date | null;
    contact_name: string | null;
    contact_number: string | null;
    attendant_name: string | null;
    queue_name: string | null;
    reason: string | null;
    reason_id: number | null;
}

export type SaleOutcome = 'made' | 'not_made';

export interface SaleUpdate {
    is_sale: number;
    service_not_made: number;
    sale_price: string;
    reasons_id: number | null;
}

/** Tickets finalizados vistos como vendas feitas ou perdidas. */
export interface SalesReportRepository {
    page(companyId: string, outcome: SaleOutcome, filter: SalesFilter, pagination: Pagination): Promise<{ rows: SaleRow[]; count: number }>;
    prices(companyId: string, filter: SalesFilter): Promise<(string | null)[]>;
    reasonOptions(companyId: string): Promise<{ id: number; reason: string; color: string | null }[]>;
    reasonExists(id: number, companyId: string): Promise<boolean>;
    channels(companyId: string): Promise<string[]>;
    updateSale(ticketId: number, companyId: string, update: SaleUpdate): Promise<boolean>;
}

export class DrizzleSalesReportRepository implements SalesReportRepository {
    constructor(private readonly db: DB) {}

    async page(companyId: string, outcome: SaleOutcome, filter: SalesFilter, pagination: Pagination) {
        const where = this.where(companyId, outcome, filter);
        const [rows, [counted]] = await Promise.all([
            this.db.select({
                id: tickets.id, origin: tickets.origin, sale_price: tickets.sale_price,
                created_at: tickets.created_at, updated_at: tickets.updated_at,
                contact_name: contacts.name, contact_number: contacts.number, attendant_name: users.name,
                queue_name: queues.name, reason: crm_sales_reasons.reason, reason_id: crm_sales_reasons.id,
            })
                .from(tickets)
                .innerJoin(contacts, eq(contacts.id, tickets.contact_id))
                .leftJoin(users, eq(users.id, tickets.attendant_user_id))
                .leftJoin(queues, eq(queues.id, tickets.queue_id))
                .leftJoin(crm_sales_reasons, eq(crm_sales_reasons.id, tickets.reasons_id))
                .where(where)
                .orderBy(desc(tickets.updated_at))
                .limit(pagination.limit)
                .offset(pagination.offset),
            this.db.select({ count: sql<number>`cast(count(*) as int)` }).from(tickets).where(where),
        ]);
        return { rows, count: counted?.count ?? 0 };
    }

    async prices(companyId: string, filter: SalesFilter) {
        const rows = await this.db.select({ sale_price: tickets.sale_price }).from(tickets).where(this.where(companyId, 'made', filter));
        return rows.map((r) => r.sale_price);
    }

    reasonOptions(companyId: string): Promise<{ id: number; reason: string; color: string | null }[]> {
        return this.db.select({ id: crm_sales_reasons.id, reason: crm_sales_reasons.reason, color: crm_sales_reasons.color })
            .from(crm_sales_reasons).where(eq(crm_sales_reasons.company_id, companyId)).orderBy(crm_sales_reasons.reason);
    }

    async reasonExists(id: number, companyId: string) {
        const [row] = await this.db.select({ id: crm_sales_reasons.id }).from(crm_sales_reasons)
            .where(and(eq(crm_sales_reasons.id, id), eq(crm_sales_reasons.company_id, companyId))).limit(1);
        return Boolean(row);
    }

    async channels(companyId: string) {
        const rows = await this.db.selectDistinct({ channel: tickets.origin }).from(tickets)
            .where(and(eq(tickets.company_id, companyId), isNull(tickets.deleted_at)));
        return rows.map((r) => r.channel).filter((c): c is string => Boolean(c));
    }

    async updateSale(ticketId: number, companyId: string, update: SaleUpdate) {
        const [row] = await this.db.update(tickets).set({ ...update, updated_at: new Date() })
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .returning({ id: tickets.id });
        return Boolean(row);
    }

    /** RN-CRM-06: finalizados da empresa; venda = is_sale; perdida = sem venda ou "não atendido". */
    private where(companyId: string, outcome: SaleOutcome, f: SalesFilter): SQL | undefined {
        const conditions: (SQL | undefined)[] = [
            eq(tickets.company_id, companyId),
            eq(tickets.status_id, 3),
            outcome === 'made' ? eq(tickets.is_sale, 1) : or(eq(tickets.is_sale, 0), eq(tickets.service_not_made, 1)),
            isNull(tickets.deleted_at),
        ];
        if (f.dateInit) conditions.push(gte(tickets.updated_at, startOfDayBR(f.dateInit)));
        if (f.dateEnd) conditions.push(lte(tickets.updated_at, endOfDayBR(f.dateEnd)));
        if (f.userId) conditions.push(eq(tickets.attendant_user_id, f.userId));
        if (f.queueId) conditions.push(eq(tickets.queue_id, f.queueId));
        return and(...conditions);
    }
}
