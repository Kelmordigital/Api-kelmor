"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsService = void 0;
const client_1 = require("../../database/client");
const auth_schema_1 = require("../auth/auth.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const drizzle_orm_1 = require("drizzle-orm");
const exceljs_1 = __importDefault(require("exceljs"));
function retentionFloor() {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
}
function todayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
function todayEnd() {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
}
async function makeExcel(sheetName, columns, rows) {
    const workbook = new exceljs_1.default.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns;
    sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
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
exports.reportsService = {
    // ── Relatório Usuários ────────────────────────────────────────────────────
    async getTicketsUser(companyId, dateStartParam, dateEndParam) {
        const floor = retentionFloor();
        const dateStart = dateStartParam ? new Date(`${dateStartParam}T00:00:00`) : null;
        const dateEnd = dateEndParam ? new Date(`${dateEndParam}T23:59:59`) : null;
        const conditions = [
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.closed_by_user_id, auth_schema_1.users.id),
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3),
            (0, drizzle_orm_1.isNotNull)(atendimento_db_schema_1.tickets.closed_by_user_id),
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId),
            (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at),
            (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, floor),
        ];
        if (dateStart)
            conditions.push((0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, dateStart));
        if (dateEnd)
            conditions.push((0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, dateEnd));
        return client_1.db
            .select({
            id: auth_schema_1.users.id,
            name: auth_schema_1.users.name,
            total_tickets: (0, drizzle_orm_1.count)(atendimento_db_schema_1.tickets.id),
        })
            .from(auth_schema_1.users)
            .leftJoin(atendimento_db_schema_1.tickets, (0, drizzle_orm_1.and)(...conditions))
            .where((0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId))
            .groupBy(auth_schema_1.users.id, auth_schema_1.users.name)
            .orderBy((0, drizzle_orm_1.asc)(auth_schema_1.users.name));
    },
    async exportTicketsUserExcel(companyId, dateStartParam, dateEndParam) {
        const rows = await exports.reportsService.getTicketsUser(companyId, dateStartParam, dateEndParam);
        return makeExcel('Usuários', [
            { header: 'Nome do Atendente', key: 'name', width: 35 },
            { header: 'Tickets Encerrados', key: 'total_tickets', width: 20 },
        ], rows);
    },
    // ── Relatório Cliente ─────────────────────────────────────────────────────
    async getClientTickets(companyId, dateStartParam, dateEndParam, page = 1, limit = 20) {
        const dateStart = dateStartParam ? new Date(`${dateStartParam}T00:00:00`) : todayStart();
        const dateEnd = dateEndParam ? new Date(`${dateEndParam}T23:59:59`) : todayEnd();
        const where = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), (0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, dateStart), (0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, dateEnd));
        const ticketCount = (0, drizzle_orm_1.count)(atendimento_db_schema_1.tickets.id);
        const [rows, countRows] = await Promise.all([
            client_1.db
                .select({ client: atendimento_db_schema_1.contacts.name, ticket_count: ticketCount })
                .from(atendimento_db_schema_1.tickets)
                .innerJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, atendimento_db_schema_1.contacts.id))
                .where(where)
                .groupBy(atendimento_db_schema_1.contacts.name)
                .orderBy((0, drizzle_orm_1.desc)(ticketCount))
                .limit(limit)
                .offset((page - 1) * limit),
            client_1.db
                .select({ total: (0, drizzle_orm_1.sql) `COUNT(DISTINCT ${atendimento_db_schema_1.contacts.name})` })
                .from(atendimento_db_schema_1.tickets)
                .innerJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, atendimento_db_schema_1.contacts.id))
                .where(where),
        ]);
        const total = Number(countRows[0]?.total ?? 0);
        return {
            items: rows,
            count: total,
            pages: Math.max(1, Math.ceil(total / limit)),
        };
    },
    async exportClientTicketsExcel(companyId, dateStartParam, dateEndParam) {
        const { items } = await exports.reportsService.getClientTickets(companyId, dateStartParam, dateEndParam, 1, 999999);
        return makeExcel('Clientes', [
            { header: 'Cliente', key: 'client', width: 35 },
            { header: 'Total de Atendimentos', key: 'ticket_count', width: 25 },
        ], items);
    },
    // ── Relatório Tempo Médio ─────────────────────────────────────────────────
    async getAverage(companyId, params) {
        const { dateInit, dateEnd, queueId, userId, connectionId, graph, page = 1, limit = 20 } = params;
        const extra = [];
        if (graph) {
            extra.push((0, drizzle_orm_1.sql) `AND t.created_at::date >= CURRENT_DATE - INTERVAL '6 days'`);
        }
        else {
            if (dateInit)
                extra.push((0, drizzle_orm_1.sql) `AND t.created_at::date >= ${dateInit}::date`);
            if (dateEnd)
                extra.push((0, drizzle_orm_1.sql) `AND t.created_at::date <= ${dateEnd}::date`);
        }
        if (queueId)
            extra.push((0, drizzle_orm_1.sql) `AND t.queue_id = ${queueId}`);
        if (userId)
            extra.push((0, drizzle_orm_1.sql) `AND t.attendant_user_id = ${userId}`);
        if (connectionId)
            extra.push((0, drizzle_orm_1.sql) `AND t.connection_id = ${connectionId}`);
        const extraWhere = extra.length
            ? drizzle_orm_1.sql.join(extra, (0, drizzle_orm_1.sql) ` `)
            : (0, drizzle_orm_1.sql) ``;
        const limitOffset = graph
            ? (0, drizzle_orm_1.sql) ``
            : (0, drizzle_orm_1.sql) `LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
        const rows = await client_1.db.execute((0, drizzle_orm_1.sql) `
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
        return rows;
    },
    async exportAverageExcel(companyId, params) {
        const rows = await exports.reportsService.getAverage(companyId, { ...params, page: 1, limit: 99999 });
        return makeExcel('Tempo Médio', [
            { header: 'Dia', key: 'day', width: 18 },
            { header: 'Tempo para Atender', key: 'label_opened', width: 22 },
            { header: 'Tempo em Atendimento', key: 'label_closed', width: 25 },
        ], rows);
    },
};
//# sourceMappingURL=reports.service.js.map