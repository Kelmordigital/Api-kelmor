"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cupomService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const cupom_db_schema_1 = require("./cupom.db.schema");
exports.cupomService = {
    async list(companyId) {
        return client_1.db
            .select()
            .from(cupom_db_schema_1.cupons)
            .where((0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.company_id, companyId))
            .orderBy((0, drizzle_orm_1.desc)(cupom_db_schema_1.cupons.created_at));
    },
    async findById(id, companyId) {
        const [row] = await client_1.db
            .select()
            .from(cupom_db_schema_1.cupons)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.id, id), (0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.company_id, companyId)))
            .limit(1);
        return row ?? null;
    },
    async isCodeTaken(companyId, code, excludeId) {
        const conditions = [(0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.company_id, companyId), (0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.code, code)];
        if (excludeId)
            conditions.push((0, drizzle_orm_1.ne)(cupom_db_schema_1.cupons.id, excludeId));
        const [row] = await client_1.db
            .select({ id: cupom_db_schema_1.cupons.id })
            .from(cupom_db_schema_1.cupons)
            .where((0, drizzle_orm_1.and)(...conditions))
            .limit(1);
        return !!row;
    },
    async create(companyId, payload) {
        const [row] = await client_1.db
            .insert(cupom_db_schema_1.cupons)
            .values({ ...payload, company_id: companyId })
            .returning();
        return row;
    },
    async update(id, companyId, payload) {
        const [row] = await client_1.db
            .update(cupom_db_schema_1.cupons)
            .set({ ...payload, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.id, id), (0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.company_id, companyId)))
            .returning();
        return row ?? null;
    },
    async remove(id, companyId) {
        const [row] = await client_1.db
            .delete(cupom_db_schema_1.cupons)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.id, id), (0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.company_id, companyId)))
            .returning();
        return !!row;
    },
};
//# sourceMappingURL=cupom.service.js.map