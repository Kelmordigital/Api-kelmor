"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleCupomRepository = exports.DUPLICATE_CODE_MESSAGE = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const http_errors_1 = require("../../core/errors/http-errors");
const pg_errors_1 = require("../../core/database/pg-errors");
const cupom_db_schema_1 = require("./cupom.db.schema");
exports.DUPLICATE_CODE_MESSAGE = 'Já existe um cupom com esse código';
class DrizzleCupomRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async listByCompany(companyId) {
        return this.db
            .select()
            .from(cupom_db_schema_1.cupons)
            .where((0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.company_id, companyId))
            .orderBy((0, drizzle_orm_1.desc)(cupom_db_schema_1.cupons.created_at));
    }
    async findById(id, companyId) {
        const [row] = await this.db
            .select()
            .from(cupom_db_schema_1.cupons)
            .where(this.byIdInCompany(id, companyId))
            .limit(1);
        return row ?? null;
    }
    async isCodeTaken(companyId, code, excludeId) {
        const conditions = [(0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.company_id, companyId), (0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.code, code)];
        if (excludeId)
            conditions.push((0, drizzle_orm_1.ne)(cupom_db_schema_1.cupons.id, excludeId));
        const [row] = await this.db
            .select({ id: cupom_db_schema_1.cupons.id })
            .from(cupom_db_schema_1.cupons)
            .where((0, drizzle_orm_1.and)(...conditions))
            .limit(1);
        return !!row;
    }
    async create(companyId, data) {
        return this.guardUniqueCode(async () => {
            const [row] = await this.db
                .insert(cupom_db_schema_1.cupons)
                .values({ ...data, company_id: companyId })
                .returning();
            return row;
        });
    }
    async update(id, companyId, data) {
        return this.guardUniqueCode(async () => {
            const [row] = await this.db
                .update(cupom_db_schema_1.cupons)
                .set({ ...data, updated_at: new Date() })
                .where(this.byIdInCompany(id, companyId))
                .returning();
            return row ?? null;
        });
    }
    async delete(id, companyId) {
        const [row] = await this.db
            .delete(cupom_db_schema_1.cupons)
            .where(this.byIdInCompany(id, companyId))
            .returning({ id: cupom_db_schema_1.cupons.id });
        return !!row;
    }
    byIdInCompany(id, companyId) {
        return (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.id, id), (0, drizzle_orm_1.eq)(cupom_db_schema_1.cupons.company_id, companyId));
    }
    /** Duas requisições simultâneas passam pelo isCodeTaken; o índice único decide. */
    async guardUniqueCode(write) {
        try {
            return await write();
        }
        catch (err) {
            if ((0, pg_errors_1.isUniqueViolation)(err))
                throw new http_errors_1.ConflictError(exports.DUPLICATE_CODE_MESSAGE);
            throw err;
        }
    }
}
exports.DrizzleCupomRepository = DrizzleCupomRepository;
//# sourceMappingURL=cupom.repository.js.map