"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleEtiquetaRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const etiqueta_db_schema_1 = require("./etiqueta.db.schema");
class DrizzleEtiquetaRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    listByCompany(companyId) {
        return this.db.select().from(etiqueta_db_schema_1.etiquetas)
            .where((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId))
            .orderBy((0, drizzle_orm_1.desc)(etiqueta_db_schema_1.etiquetas.created_at));
    }
    async findById(id, companyId) {
        const [row] = await this.db.select().from(etiqueta_db_schema_1.etiquetas).where(this.byIdInCompany(id, companyId)).limit(1);
        return row ?? null;
    }
    async create(companyId, data) {
        const [row] = await this.db.insert(etiqueta_db_schema_1.etiquetas).values({ ...data, company_id: companyId }).returning();
        return row;
    }
    async update(id, companyId, patch) {
        const [row] = await this.db.update(etiqueta_db_schema_1.etiquetas)
            .set({ ...patch, updated_at: new Date() })
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }
    async delete(id, companyId) {
        const [row] = await this.db.delete(etiqueta_db_schema_1.etiquetas).where(this.byIdInCompany(id, companyId)).returning({ id: etiqueta_db_schema_1.etiquetas.id });
        return !!row;
    }
    // contact_id é varchar (aceita ids de leads antigos); contatos numéricos viram texto
    async linkToContact(contactId, etiquetaId) {
        await this.db.insert(etiqueta_db_schema_1.contactEtiquetas)
            .values({ contact_id: String(contactId), etiqueta_id: etiquetaId })
            .onConflictDoNothing();
    }
    async unlinkFromContact(contactId, etiquetaId) {
        await this.db.delete(etiqueta_db_schema_1.contactEtiquetas)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.contact_id, String(contactId)), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, etiquetaId)));
    }
    async listForContact(contactId, companyId) {
        const rows = await this.db.select({ etiqueta: etiqueta_db_schema_1.etiquetas })
            .from(etiqueta_db_schema_1.contactEtiquetas)
            .innerJoin(etiqueta_db_schema_1.etiquetas, (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, etiqueta_db_schema_1.etiquetas.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.contactEtiquetas.contact_id, String(contactId)), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId)));
        return rows.map((r) => r.etiqueta);
    }
    async usage(etiquetaIds, since) {
        const usage = { totals: new Map(), daily: new Map() };
        if (etiquetaIds.length === 0)
            return usage;
        const day = (0, drizzle_orm_1.sql) `to_char(${etiqueta_db_schema_1.contactEtiquetas.created_at}, 'YYYY-MM-DD')`;
        const [totals, daily] = await Promise.all([
            this.db.select({ id: etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, total: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(etiqueta_db_schema_1.contactEtiquetas)
                .where((0, drizzle_orm_1.inArray)(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, etiquetaIds))
                .groupBy(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id),
            this.db.select({ id: etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, day, total: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(etiqueta_db_schema_1.contactEtiquetas)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, etiquetaIds), (0, drizzle_orm_1.gte)(etiqueta_db_schema_1.contactEtiquetas.created_at, since)))
                .groupBy(etiqueta_db_schema_1.contactEtiquetas.etiqueta_id, day),
        ]);
        for (const row of totals)
            usage.totals.set(row.id, row.total);
        for (const row of daily) {
            const byDay = usage.daily.get(row.id) ?? new Map();
            byDay.set(row.day, row.total);
            usage.daily.set(row.id, byDay);
        }
        return usage;
    }
    byIdInCompany(id, companyId) {
        return (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.id, id), (0, drizzle_orm_1.eq)(etiqueta_db_schema_1.etiquetas.company_id, companyId));
    }
}
exports.DrizzleEtiquetaRepository = DrizzleEtiquetaRepository;
//# sourceMappingURL=etiqueta.repository.js.map