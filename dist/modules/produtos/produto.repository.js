"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleProdutoRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const produto_db_schema_1 = require("./produto.db.schema");
class DrizzleProdutoRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async listByCompany(companyId) {
        return this.db
            .select()
            .from(produto_db_schema_1.produtos)
            .where((0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.company_id, companyId))
            .orderBy((0, drizzle_orm_1.desc)(produto_db_schema_1.produtos.created_at));
    }
    async findById(id, companyId) {
        const [row] = await this.db
            .select()
            .from(produto_db_schema_1.produtos)
            .where(this.byIdInCompany(id, companyId))
            .limit(1);
        return row ?? null;
    }
    async create(companyId, data) {
        const [row] = await this.db
            .insert(produto_db_schema_1.produtos)
            .values({ ...data, company_id: companyId })
            .returning();
        return row;
    }
    async update(id, companyId, patch) {
        const [row] = await this.db
            .update(produto_db_schema_1.produtos)
            .set({ ...patch, updated_at: new Date() })
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }
    async delete(id, companyId) {
        const [row] = await this.db
            .delete(produto_db_schema_1.produtos)
            .where(this.byIdInCompany(id, companyId))
            .returning({ id: produto_db_schema_1.produtos.id });
        return !!row;
    }
    byIdInCompany(id, companyId) {
        return (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.id, id), (0, drizzle_orm_1.eq)(produto_db_schema_1.produtos.company_id, companyId));
    }
}
exports.DrizzleProdutoRepository = DrizzleProdutoRepository;
//# sourceMappingURL=produto.repository.js.map