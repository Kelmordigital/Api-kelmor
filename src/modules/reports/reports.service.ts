import { db } from '../../database/client';
import { users } from '../auth/auth.schema';
import { tickets, contacts } from '../atendimento/atendimento.db.schema';
import { count, eq, and, isNull, isNotNull, gte, lte, asc, desc, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import type { SQL } from 'drizzle-orm';

function retentionFloor(): Date {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
}

function todayStart(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function todayEnd(): Date {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
}

async function makeExcel(
    sheetName: string,
    columns: { header: string; key: string; width: number }[],
    rows: Record<string, unknown>[],
): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet    = workbook.addWorksheet(sheetName);
    sheet.columns  = columns;

    sheet.getRow(1).eachCell(cell => {
        cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    rows.forEach((r, i) => {
        const row = sheet.addRow(r);
        if (i % 2 === 1) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
            });
        }
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const reportsService = {
    // ── Relatório Usuários ────────────────────────────────────────────────────

    async getTicketsUser(companyId: string, dateStartParam?: string, dateEndParam?: string) {
        const floor = retentionFloor();

        const dateStart = dateStartParam ? new Date(`${dateStartParam}T00:00:00`) : null;
        const dateEnd   = dateEndParam   ? new Date(`${dateEndParam}T23:59:59`)   : null;

        const conditions = [
            eq(tickets.closed_by_user_id, users.id),
            eq(tickets.status_id, 3),
            isNotNull(tickets.closed_by_user_id),
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            gte(tickets.updated_at, floor),
        ];

        if (dateStart) conditions.push(gte(tickets.updated_at, dateStart));
        if (dateEnd)   conditions.push(lte(tickets.updated_at, dateEnd));

        return db
            .select({
                id:            users.id,
                name:          users.name,
                total_tickets: count(tickets.id),
            })
            .from(users)
            .leftJoin(tickets, and(...conditions))
            .where(eq(users.company_id, companyId))
            .groupBy(users.id, users.name)
            .orderBy(asc(users.name));
    },

    async exportTicketsUserExcel(companyId: string, dateStartParam?: string, dateEndParam?: string): Promise<Buffer> {
        const rows = await reportsService.getTicketsUser(companyId, dateStartParam, dateEndParam);
        return makeExcel(
            'Usuários',
            [
                { header: 'Nome do Atendente',  key: 'name',          width: 35 },
                { header: 'Tickets Encerrados', key: 'total_tickets',  width: 20 },
            ],
            rows as Record<string, unknown>[],
        );
    },

    // ── Relatório Cliente ─────────────────────────────────────────────────────

    async getClientTickets(
        companyId: string,
        dateStartParam?: string,
        dateEndParam?: string,
        page    = 1,
        limit   = 20,
    ) {
        const dateStart = dateStartParam ? new Date(`${dateStartParam}T00:00:00`) : todayStart();
        const dateEnd   = dateEndParam   ? new Date(`${dateEndParam}T23:59:59`)   : todayEnd();

        const where = and(
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
            gte(tickets.updated_at, dateStart),
            lte(tickets.updated_at, dateEnd),
        );

        const ticketCount = count(tickets.id);

        const [rows, countRows] = await Promise.all([
            db
                .select({ client: contacts.name, ticket_count: ticketCount })
                .from(tickets)
                .innerJoin(contacts, eq(tickets.contact_id, contacts.id))
                .where(where)
                .groupBy(contacts.name)
                .orderBy(desc(ticketCount))
                .limit(limit)
                .offset((page - 1) * limit),

            db
                .select({ total: sql<number>`COUNT(DISTINCT ${contacts.name})` })
                .from(tickets)
                .innerJoin(contacts, eq(tickets.contact_id, contacts.id))
                .where(where),
        ]);

        const total = Number(countRows[0]?.total ?? 0);

        return {
            items: rows,
            count: total,
            pages: Math.max(1, Math.ceil(total / limit)),
        };
    },

    async exportClientTicketsExcel(companyId: string, dateStartParam?: string, dateEndParam?: string): Promise<Buffer> {
        const { items } = await reportsService.getClientTickets(companyId, dateStartParam, dateEndParam, 1, 999999);
        return makeExcel(
            'Clientes',
            [
                { header: 'Cliente',               key: 'client',       width: 35 },
                { header: 'Total de Atendimentos', key: 'ticket_count', width: 25 },
            ],
            items as Record<string, unknown>[],
        );
    },

    // ── Relatório Tempo Médio ─────────────────────────────────────────────────

    async getAverage(companyId: string, params: {
        dateInit?: string;
        dateEnd?: string;
        queueId?: number;
        userId?: string;
        connectionId?: number;
        page?: number;
        limit?: number;
        graph?: boolean;
    }) {
        const { dateInit, dateEnd, queueId, userId, connectionId, graph, page = 1, limit = 20 } = params;

        const extra: SQL[] = [];

        if (graph) {
            extra.push(sql`AND t.created_at::date >= CURRENT_DATE - INTERVAL '6 days'`);
        } else {
            if (dateInit) extra.push(sql`AND t.created_at::date >= ${dateInit}::date`);
            if (dateEnd)  extra.push(sql`AND t.created_at::date <= ${dateEnd}::date`);
        }
        if (queueId)      extra.push(sql`AND t.queue_id = ${queueId}`);
        if (userId)       extra.push(sql`AND t.attendant_user_id = ${userId}`);
        if (connectionId) extra.push(sql`AND t.connection_id = ${connectionId}`);

        const extraWhere = extra.length
            ? sql.join(extra, sql` `)
            : sql``;

        const limitOffset = graph
            ? sql``
            : sql`LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

        const rows = await db.execute(sql`
            SELECT
                TO_CHAR(t.created_at::date, 'DD/MM/YYYY') AS day,

                COALESCE(ROUND(AVG(
                    CASE WHEN ht.status_id_end = 2
                    THEN EXTRACT(EPOCH FROM (ht.created_at - t.created_at))
                    ELSE NULL END
                )), 0)::bigint * 1000 AS time_opened,

                TO_CHAR(
                    COALESCE(ROUND(AVG(
                        CASE WHEN ht.status_id_end = 2
                        THEN EXTRACT(EPOCH FROM (ht.created_at - t.created_at))
                        ELSE NULL END
                    )), 0)::numeric * interval '1 second',
                    'HH24:MI:SS'
                ) AS label_opened,

                COALESCE(ROUND(AVG(
                    CASE WHEN ht.status_id_end IN (3, 7)
                    THEN EXTRACT(EPOCH FROM (ht.created_at - t.created_at))
                    ELSE NULL END
                )), 0)::bigint * 1000 AS time_closed,

                TO_CHAR(
                    COALESCE(ROUND(AVG(
                        CASE WHEN ht.status_id_end IN (3, 7)
                        THEN EXTRACT(EPOCH FROM (ht.created_at - t.created_at))
                        ELSE NULL END
                    )), 0)::numeric * interval '1 second',
                    'HH24:MI:SS'
                ) AS label_closed

            FROM at_tickets t
            INNER JOIN at_historic_tickets ht ON t.id = ht.ticket_id

            WHERE t.company_id = ${companyId}
              AND t.deleted_at IS NULL
              AND ht.status_id_end IN (2, 3, 7)
              AND t.created_at >= NOW() - INTERVAL '90 days'
              ${extraWhere}

            GROUP BY t.created_at::date
            ORDER BY t.created_at::date ASC
            ${limitOffset}
        `);

        return rows as unknown as Array<{
            day: string;
            time_opened: number;
            label_opened: string;
            time_closed: number;
            label_closed: string;
        }>;
    },

    async exportAverageExcel(companyId: string, params: {
        dateInit?: string; dateEnd?: string;
        queueId?: number; userId?: string; connectionId?: number;
    }): Promise<Buffer> {
        const rows = await reportsService.getAverage(companyId, { ...params, page: 1, limit: 99999 });
        return makeExcel(
            'Tempo Médio',
            [
                { header: 'Dia',                  key: 'day',          width: 18 },
                { header: 'Tempo para Atender',   key: 'label_opened', width: 22 },
                { header: 'Tempo em Atendimento', key: 'label_closed', width: 25 },
            ],
            rows as unknown as Record<string, unknown>[],
        );
    },
};
