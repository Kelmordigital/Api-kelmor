"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.produtoService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const produto_db_schema_1 = require("./produto.db.schema");
exports.produtoService = {
    async list(companyId) {
        return client_1.db
            .select()
            .from(produto_db_schema_1.produtos)
            .where((0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.company_id, companyId))
            .orderBy((0, drizzle_orm_1.desc)(produto_db_schema_1.produtos.created_at));
    },
    async findById(id, companyId) {
        const [row] = await client_1.db
            .select()
            .from(produto_db_schema_1.produtos)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.id, id), (0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.company_id, companyId)))
            .limit(1);
        return row ?? null;
    },
    async create(companyId, payload) {
        const [row] = await client_1.db
            .insert(produto_db_schema_1.produtos)
            .values({ ...payload, company_id: companyId })
            .returning();
        return row;
    },
    async update(id, companyId, payload) {
        const [row] = await client_1.db
            .update(produto_db_schema_1.produtos)
            .set({ ...payload, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.id, id), (0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.company_id, companyId)))
            .returning();
        return row ?? null;
    },
    async remove(id, companyId) {
        const [row] = await client_1.db
            .delete(produto_db_schema_1.produtos)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.id, id), (0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.company_id, companyId)))
            .returning();
        return !!row;
    },
};
//# sourceMappingURL=produto.service.js.map