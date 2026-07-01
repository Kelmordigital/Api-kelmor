import { eq, and, or, isNull, desc, sql, gte, lte } from 'drizzle-orm';
import { db } from '../../database/client';
import {
    tickets, contacts, crm_sales_reasons, queues,
} from '../atendimento/atendimento.db.schema';
import { users } from '../auth/auth.schema';

function parseBrPrice(s: string | null): number {
    if (!s) return 0;
    const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
}

export const crmReportsService = {

    async salesMade(companyId: string, params: {
        dateInit?: string;
        dateEnd?:  string;
        userId?:   string;
        queueId?:  number;
        page?:     number;
        perPage?:  number;
    }): Promise<{ salesMade: any[]; count: number; totalPages: number; page: number; totalValue: number; avgValue: number }> {
        const { dateInit, dateEnd, userId, queueId, page = 1, perPage = 10 } = params;
        const offset = (page - 1) * perPage;

        const conditions: any[] = [
            eq(tickets.company_id, companyId),
            eq(tickets.status_id, 3),
            eq(tickets.is_sale, 1),
            isNull(tickets.deleted_at),
        ];
        if (dateInit) conditions.push(gte(tickets.updated_at, new Date(dateInit)));
        if (dateEnd)  conditions.push(lte(tickets.updated_at, new Date(dateEnd + 'T23:59:59')));
        if (userId)   conditions.push(eq(tickets.attendant_user_id, userId));
        if (queueId)  conditions.push(eq(tickets.queue_id, queueId));

        const where = and(...conditions);

        const [rows, countRows, priceRows] = await Promise.all([
            db
                .select({
                    id:              tickets.id,
                    origin:          tickets.origin,
                    sale_price:      tickets.sale_price,
                    updated_at:      tickets.updated_at,
                    contact_name:    contacts.name,
                    contact_number:  contacts.number,
                    attendant_name:  users.name,
                    queue_name:      queues.name,
                    reason:          crm_sales_reasons.reason,
                    reason_id:       crm_sales_reasons.id,
                })
                .from(tickets)
                .innerJoin(contacts,          eq(contacts.id,          tickets.contact_id))
                .leftJoin(users,              eq(users.id,             tickets.attendant_user_id))
                .leftJoin(queues,             eq(queues.id,            tickets.queue_id))
                .leftJoin(crm_sales_reasons,  eq(crm_sales_reasons.id, tickets.reasons_id))
                .where(where)
                .orderBy(desc(tickets.updated_at))
                .limit(perPage)
                .offset(offset),
            db
                .select({ count: sql<number>`cast(count(*) as int)` })
                .from(tickets)
                .where(where),
            db
                .select({ sale_price: tickets.sale_price })
                .from(tickets)
                .where(where),
        ]);

        const count = countRows[0]?.count ?? 0;
        const prices = priceRows.map(r => parseBrPrice(r.sale_price));
        const totalValue = prices.reduce((s, p) => s + p, 0);
        const avgValue   = prices.length > 0 ? totalValue / prices.length : 0;

        return {
            salesMade: rows.map(r => ({
                id:          r.id,
                origin:      r.origin,
                sale_price:  r.sale_price,
                updatedAt:   r.updated_at,
                contact:     { name: r.contact_name,   number: r.contact_number },
                attendant_user: r.attendant_name ? { name: r.attendant_name } : null,
                queue:       r.queue_name ? { name: r.queue_name } : null,
                sale_reason: r.reason    ? { id: r.reason_id, name: r.reason } : null,
            })),
            count,
            totalPages: Math.max(1, Math.ceil(count / perPage)),
            page,
            totalValue,
            avgValue,
        };
    },

    async salesNotMade(companyId: string, params: {
        dateInit?: string;
        dateEnd?:  string;
        userId?:   string;
        queueId?:  number;
        page?:     number;
        perPage?:  number;
    }): Promise<{ salesMade: any[]; count: number; totalPages: number; page: number; totalValue: number; avgValue: number }> {
        const { dateInit, dateEnd, userId, queueId, page = 1, perPage = 10 } = params;
        const offset = (page - 1) * perPage;

        const conditions: any[] = [
            eq(tickets.company_id, companyId),
            eq(tickets.status_id, 3),
            or(eq(tickets.is_sale, 0), eq(tickets.service_not_made, 1)),
            isNull(tickets.deleted_at),
        ];
        if (dateInit) conditions.push(gte(tickets.updated_at, new Date(dateInit)));
        if (dateEnd)  conditions.push(lte(tickets.updated_at, new Date(dateEnd + 'T23:59:59')));
        if (userId)   conditions.push(eq(tickets.attendant_user_id, userId));
        if (queueId)  conditions.push(eq(tickets.queue_id, queueId));

        const where = and(...conditions);

        const [rows, countRows] = await Promise.all([
            db
                .select({
                    id:             tickets.id,
                    origin:         tickets.origin,
                    updated_at:     tickets.updated_at,
                    contact_name:   contacts.name,
                    contact_number: contacts.number,
                    attendant_name: users.name,
                    queue_name:     queues.name,
                    reason:         crm_sales_reasons.reason,
                    reason_id:      crm_sales_reasons.id,
                })
                .from(tickets)
                .innerJoin(contacts,         eq(contacts.id,          tickets.contact_id))
                .leftJoin(users,             eq(users.id,             tickets.attendant_user_id))
                .leftJoin(queues,            eq(queues.id,            tickets.queue_id))
                .leftJoin(crm_sales_reasons, eq(crm_sales_reasons.id, tickets.reasons_id))
                .where(where)
                .orderBy(desc(tickets.updated_at))
                .limit(perPage)
                .offset(offset),
            db
                .select({ count: sql<number>`cast(count(*) as int)` })
                .from(tickets)
                .where(where),
        ]);

        const count = countRows[0]?.count ?? 0;
        return {
            salesMade: rows.map(r => ({
                id:         r.id,
                origin:     r.origin,
                updatedAt:  r.updated_at,
                contact:    { name: r.contact_name, number: r.contact_number },
                attendant_user: r.attendant_name ? { name: r.attendant_name } : null,
                queue:      r.queue_name ? { name: r.queue_name } : null,
                sale_reason: r.reason   ? { id: r.reason_id, name: r.reason } : null,
            })),
            count,
            totalPages: Math.max(1, Math.ceil(count / perPage)),
            page,
            totalValue: 0,
            avgValue:   0,
        };
    },

    async reasons(companyId: string) {
        return db
            .select({ id: crm_sales_reasons.id, reason: crm_sales_reasons.reason, color: crm_sales_reasons.color })
            .from(crm_sales_reasons)
            .where(eq(crm_sales_reasons.company_id, companyId))
            .orderBy(crm_sales_reasons.reason);
    },

    async channels(companyId: string) {
        const rows = await db
            .selectDistinct({ channel: tickets.origin })
            .from(tickets)
            .where(and(eq(tickets.company_id, companyId), isNull(tickets.deleted_at)));
        return rows.filter(r => r.channel).map(r => ({ channel: r.channel }));
    },

    async updateSale(ticketId: number, companyId: string, payload: {
        isSale:     boolean;
        salePrice?: string | null;
        reasonId?:  number | null;
    }) {
        const [updated] = await db
            .update(tickets)
            .set({
                is_sale:          payload.isSale ? 1 : 0,
                service_not_made: payload.isSale ? 0 : 1,
                sale_price:       payload.salePrice ?? '0,00',
                reasons_id:       payload.reasonId  ?? null,
                updated_at:       new Date(),
            })
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .returning({ id: tickets.id });
        return !!updated;
    },
};
