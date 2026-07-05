"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmReportsService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
function parseBrPrice(s) {
    if (!s)
        return 0;
    const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
}
exports.crmReportsService = {
    async salesMade(companyId, params) {
        const { dateInit, dateEnd, userId, queueId, page = 1, perPage = 10 } = params;
        const offset = (page - 1) * perPage;
        const conditions = [
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId),
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3),
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 1),
            (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at),
        ];
        if (dateInit)
            conditions.push((0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, new Date(dateInit)));
        if (dateEnd)
            conditions.push((0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, new Date(dateEnd + 'T23:59:59')));
        if (userId)
            conditions.push((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, userId));
        if (queueId)
            conditions.push((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.queue_id, queueId));
        const where = (0, drizzle_orm_1.and)(...conditions);
        const [rows, countRows, priceRows] = await Promise.all([
            client_1.db
                .select({
                id: atendimento_db_schema_1.tickets.id,
                origin: atendimento_db_schema_1.tickets.origin,
                sale_price: atendimento_db_schema_1.tickets.sale_price,
                created_at: atendimento_db_schema_1.tickets.created_at,
                updated_at: atendimento_db_schema_1.tickets.updated_at,
                contact_name: atendimento_db_schema_1.contacts.name,
                contact_number: atendimento_db_schema_1.contacts.number,
                attendant_name: auth_schema_1.users.name,
                queue_name: atendimento_db_schema_1.queues.name,
                reason: atendimento_db_schema_1.crm_sales_reasons.reason,
                reason_id: atendimento_db_schema_1.crm_sales_reasons.id,
            })
                .from(atendimento_db_schema_1.tickets)
                .innerJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, atendimento_db_schema_1.tickets.contact_id))
                .leftJoin(auth_schema_1.users, (0, drizzle_orm_1.eq)(auth_schema_1.users.id, atendimento_db_schema_1.tickets.attendant_user_id))
                .leftJoin(atendimento_db_schema_1.queues, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, atendimento_db_schema_1.tickets.queue_id))
                .leftJoin(atendimento_db_schema_1.crm_sales_reasons, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_sales_reasons.id, atendimento_db_schema_1.tickets.reasons_id))
                .where(where)
                .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.updated_at))
                .limit(perPage)
                .offset(offset),
            client_1.db
                .select({ count: (0, drizzle_orm_1.sql) `cast(count(*) as int)` })
                .from(atendimento_db_schema_1.tickets)
                .where(where),
            client_1.db
                .select({ sale_price: atendimento_db_schema_1.tickets.sale_price })
                .from(atendimento_db_schema_1.tickets)
                .where(where),
        ]);
        const count = countRows[0]?.count ?? 0;
        const prices = priceRows.map(r => parseBrPrice(r.sale_price));
        const totalValue = prices.reduce((s, p) => s + p, 0);
        const avgValue = prices.length > 0 ? totalValue / prices.length : 0;
        return {
            salesMade: rows.map(r => ({
                id: r.id,
                origin: r.origin,
                sale_price: r.sale_price,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                contact: { name: r.contact_name, number: r.contact_number },
                attendant_user: r.attendant_name ? { name: r.attendant_name } : null,
                queue: r.queue_name ? { name: r.queue_name } : null,
                sale_reason: r.reason ? { id: r.reason_id, name: r.reason } : null,
            })),
            count,
            totalPages: Math.max(1, Math.ceil(count / perPage)),
            page,
            totalValue,
            avgValue,
        };
    },
    async salesNotMade(companyId, params) {
        const { dateInit, dateEnd, userId, queueId, page = 1, perPage = 10 } = params;
        const offset = (page - 1) * perPage;
        const conditions = [
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId),
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3),
            (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.is_sale, 0), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.service_not_made, 1)),
            (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at),
        ];
        if (dateInit)
            conditions.push((0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, new Date(dateInit)));
        if (dateEnd)
            conditions.push((0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, new Date(dateEnd + 'T23:59:59')));
        if (userId)
            conditions.push((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, userId));
        if (queueId)
            conditions.push((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.queue_id, queueId));
        const where = (0, drizzle_orm_1.and)(...conditions);
        const [rows, countRows] = await Promise.all([
            client_1.db
                .select({
                id: atendimento_db_schema_1.tickets.id,
                origin: atendimento_db_schema_1.tickets.origin,
                created_at: atendimento_db_schema_1.tickets.created_at,
                updated_at: atendimento_db_schema_1.tickets.updated_at,
                contact_name: atendimento_db_schema_1.contacts.name,
                contact_number: atendimento_db_schema_1.contacts.number,
                attendant_name: auth_schema_1.users.name,
                queue_name: atendimento_db_schema_1.queues.name,
                reason: atendimento_db_schema_1.crm_sales_reasons.reason,
                reason_id: atendimento_db_schema_1.crm_sales_reasons.id,
            })
                .from(atendimento_db_schema_1.tickets)
                .innerJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, atendimento_db_schema_1.tickets.contact_id))
                .leftJoin(auth_schema_1.users, (0, drizzle_orm_1.eq)(auth_schema_1.users.id, atendimento_db_schema_1.tickets.attendant_user_id))
                .leftJoin(atendimento_db_schema_1.queues, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, atendimento_db_schema_1.tickets.queue_id))
                .leftJoin(atendimento_db_schema_1.crm_sales_reasons, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_sales_reasons.id, atendimento_db_schema_1.tickets.reasons_id))
                .where(where)
                .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.updated_at))
                .limit(perPage)
                .offset(offset),
            client_1.db
                .select({ count: (0, drizzle_orm_1.sql) `cast(count(*) as int)` })
                .from(atendimento_db_schema_1.tickets)
                .where(where),
        ]);
        const count = countRows[0]?.count ?? 0;
        return {
            salesMade: rows.map(r => ({
                id: r.id,
                origin: r.origin,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
                contact: { name: r.contact_name, number: r.contact_number },
                attendant_user: r.attendant_name ? { name: r.attendant_name } : null,
                queue: r.queue_name ? { name: r.queue_name } : null,
                sale_reason: r.reason ? { id: r.reason_id, name: r.reason } : null,
            })),
            count,
            totalPages: Math.max(1, Math.ceil(count / perPage)),
            page,
            totalValue: 0,
            avgValue: 0,
        };
    },
    async reasons(companyId) {
        return client_1.db
            .select({ id: atendimento_db_schema_1.crm_sales_reasons.id, reason: atendimento_db_schema_1.crm_sales_reasons.reason, color: atendimento_db_schema_1.crm_sales_reasons.color })
            .from(atendimento_db_schema_1.crm_sales_reasons)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.crm_sales_reasons.company_id, companyId))
            .orderBy(atendimento_db_schema_1.crm_sales_reasons.reason);
    },
    async channels(companyId) {
        const rows = await client_1.db
            .selectDistinct({ channel: atendimento_db_schema_1.tickets.origin })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at)));
        return rows.filter(r => r.channel).map(r => ({ channel: r.channel }));
    },
    async updateSale(ticketId, companyId, payload) {
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({
            is_sale: payload.isSale ? 1 : 0,
            service_not_made: payload.isSale ? 0 : 1,
            sale_price: payload.salePrice ?? '0,00',
            reasons_id: payload.reasonId ?? null,
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .returning({ id: atendimento_db_schema_1.tickets.id });
        return !!updated;
    },
};
//# sourceMappingURL=crm-reports.service.js.map