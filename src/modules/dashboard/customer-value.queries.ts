import { sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../../core/database/executor';
import { brCalendar, brLocal } from '../../core/dates/br-day';
import { containsPattern } from '../../core/database/like-pattern';

export type CustomerSort = 'total' | 'compras' | 'ultima';

export interface CustomerValueRow {
    contactId: number;
    name: string;
    number: string | null;
    total: number;
    purchases: number;
    lastPurchase: string;
    /** 12 meses: [0] = 11 meses atrás, [11] = mês atual (calendário de Brasília). */
    months: number[];
}

export interface CustomerValueSummary {
    ltv: number;
    repeatRate: number;
    customers: number;
    avgTicket: number;
    /** Por mês da 1ª compra (últimos 12): retention[n] = fração que comprou de novo n meses depois. */
    cohorts: Array<{ month: string; customers: number; retention: number[] }>;
}

const WINDOW = 12;
const monthIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
const ymOf = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/** Mês atual (Brasília) como índice contínuo (ano*12 + mês). */
function currentMonthIndex(now: Date): number {
    const { year, month } = brCalendar(now);
    return year * 12 + month;
}

/**
 * Quanto cada cliente já gastou (LTV) e se volta a comprar. Venda = ticket fechado como
 * venda (mesma regra do Financeiro); data da compra = última data de fechamento no
 * histórico do ticket (sem histórico, a última alteração), não a última alteração —
 * que muda ao reclassificar ou ao chegar mensagem depois de fechar.
 */
export class CustomerValueQueries {
    constructor(private readonly db: DbExecutor) {}

    private sales(companyId: string, connectionId?: number): SQL {
        return sql`sales as (
            select t.contact_id,
                   coalesce(cast(nullif(replace(replace(t.sale_price, '.', ''), ',', '.'), '') as numeric), 0) as value,
                   coalesce(
                       (select max(h.created_at) from at_historic_tickets h where h.ticket_id = t.id and h.status_id_end = 3),
                       t.updated_at
                   ) as sold_at
            from at_tickets t
            where t.company_id = ${companyId}
              and t.status_id = 3 and t.is_sale = 1 and t.service_not_made = 0 and t.deleted_at is null
              ${connectionId ? sql`and t.connection_id = ${connectionId}` : sql``}
        )`;
    }

    private month(column: string): SQL {
        return sql`to_char(${brLocal(sql.raw(column))}, 'YYYY-MM')`;
    }

    async ranking(
        companyId: string,
        o: { connectionId?: number; search?: string; sort: CustomerSort; limit: number; offset: number; now?: Date },
    ): Promise<{ items: CustomerValueRow[]; total: number }> {
        const order = o.sort === 'compras' ? sql`a.purchases desc, a.total desc`
            : o.sort === 'ultima' ? sql`a.last_purchase desc`
            : sql`a.total desc`;
        const search = o.search?.trim()
            ? sql`where (c.name ilike ${containsPattern(o.search.trim())} or c.number ilike ${containsPattern(o.search.trim())})`
            : sql``;

        const rows = await this.db.execute<{
            contact_id: string; name: string; number: string | null; total: string; purchases: string; last_purchase: Date; full_count: string;
        }>(sql`
            with ${this.sales(companyId, o.connectionId)},
            agg as (select contact_id, sum(value) as total, count(*) as purchases, max(sold_at) as last_purchase from sales group by contact_id)
            select a.contact_id, c.name, c.number, a.total, a.purchases, a.last_purchase, count(*) over () as full_count
            from agg a join at_contacts c on c.id = a.contact_id
            ${search}
            order by ${order}, a.contact_id
            limit ${o.limit} offset ${o.offset}
        `);
        const list = [...rows];
        if (list.length === 0) return { items: [], total: 0 };

        const current = currentMonthIndex(o.now ?? new Date());
        const first = current - (WINDOW - 1);
        const ids = list.map((r) => Number(r.contact_id));
        const monthly = await this.db.execute<{ contact_id: string; ym: string; total: string }>(sql`
            with ${this.sales(companyId, o.connectionId)}
            select contact_id, ${this.month('sold_at')} as ym, sum(value) as total
            from sales
            where contact_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
            group by 1, 2
        `);
        const byContact = new Map<number, number[]>(ids.map((id) => [id, Array(WINDOW).fill(0)]));
        for (const m of monthly) {
            const slot = monthIndex(m.ym) - first;
            if (slot >= 0 && slot < WINDOW) byContact.get(Number(m.contact_id))![slot] = Number(m.total);
        }

        return {
            total: Number(list[0].full_count),
            items: list.map((r) => ({
                contactId: Number(r.contact_id),
                name: r.name,
                number: r.number,
                total: Number(r.total),
                purchases: Number(r.purchases),
                lastPurchase: new Date(r.last_purchase).toISOString(),
                months: byContact.get(Number(r.contact_id))!,
            })),
        };
    }

    async summary(companyId: string, o: { connectionId?: number; now?: Date }): Promise<CustomerValueSummary> {
        const [totals] = await this.db.execute<{ customers: string; revenue: string; sales: string; repeaters: string }>(sql`
            with ${this.sales(companyId, o.connectionId)}
            select count(distinct contact_id) as customers,
                   coalesce(sum(value), 0) as revenue,
                   count(*) as sales,
                   (select count(*) from (select contact_id from sales group by contact_id having count(*) >= 2) r) as repeaters
            from sales
        `);
        const customers = Number(totals?.customers ?? 0);
        const revenue = Number(totals?.revenue ?? 0);
        const salesCount = Number(totals?.sales ?? 0);
        if (customers === 0) return { ltv: 0, repeatRate: 0, customers: 0, avgTicket: 0, cohorts: [] };

        const current = currentMonthIndex(o.now ?? new Date());
        const windowStart = ymOf(current - (WINDOW - 1));
        const rows = await this.db.execute<{ first_ym: string; ym: string; n: string }>(sql`
            with ${this.sales(companyId, o.connectionId)},
            m as (select contact_id, ${this.month('sold_at')} as ym from sales group by 1, 2),
            f as (select contact_id, min(ym) as first_ym from m group by 1)
            select f.first_ym, m.ym, count(distinct m.contact_id) as n
            from f join m on m.contact_id = f.contact_id
            where f.first_ym >= ${windowStart}
            group by 1, 2
            order by 1, 2
        `);

        const cohorts = new Map<string, Map<number, number>>();
        for (const r of rows) {
            const offsets = cohorts.get(r.first_ym) ?? new Map<number, number>();
            offsets.set(monthIndex(r.ym) - monthIndex(r.first_ym), Number(r.n));
            cohorts.set(r.first_ym, offsets);
        }

        return {
            customers,
            ltv: revenue / customers,
            repeatRate: Number(totals.repeaters) / customers,
            avgTicket: salesCount ? revenue / salesCount : 0,
            cohorts: [...cohorts.entries()].map(([month, offsets]) => {
                const size = offsets.get(0) ?? 0;
                const span = current - monthIndex(month);
                return {
                    month,
                    customers: size,
                    retention: Array.from({ length: span + 1 }, (_, n) => (size ? (offsets.get(n) ?? 0) / size : 0)),
                };
            }),
        };
    }
}
