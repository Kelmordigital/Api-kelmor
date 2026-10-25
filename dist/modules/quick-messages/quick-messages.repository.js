"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleQuickMessageRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const like_pattern_1 = require("../../core/database/like-pattern");
const quick_messages_db_schema_1 = require("./quick-messages.db.schema");
class DrizzleQuickMessageRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async page(companyId, { search, limit, offset }) {
        const where = search
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.company_id, companyId), (0, drizzle_orm_1.ilike)(quick_messages_db_schema_1.quickMessages.title, (0, like_pattern_1.containsPattern)(search)))
            : (0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.company_id, companyId);
        const [rows, [{ total }]] = await Promise.all([
            this.db.select()
                .from(quick_messages_db_schema_1.quickMessages)
                .where(where)
                .orderBy(quick_messages_db_schema_1.quickMessages.created_at)
                .limit(limit)
                .offset(offset),
            this.db.select({ total: (0, drizzle_orm_1.count)() }).from(quick_messages_db_schema_1.quickMessages).where(where),
        ]);
        return { rows, total: Number(total) };
    }
    async findById(id, companyId) {
        const [row] = await this.db
            .select()
            .from(quick_messages_db_schema_1.quickMessages)
            .where(this.byIdInCompany(id, companyId));
        return row ?? null;
    }
    async create(companyId, data) {
        const [row] = await this.db
            .insert(quick_messages_db_schema_1.quickMessages)
            .values({ ...data, company_id: companyId, updated_at: new Date() })
            .returning();
        return row;
    }
    async update(id, companyId, patch) {
        const [row] = await this.db
            .update(quick_messages_db_schema_1.quickMessages)
            .set({ ...patch, updated_at: new Date() })
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }
    async delete(id, companyId) {
        const [row] = await this.db
            .delete(quick_messages_db_schema_1.quickMessages)
            .where(this.byIdInCompany(id, companyId))
            .returning({ id: quick_messages_db_schema_1.quickMessages.id });
        return !!row;
    }
    byIdInCompany(id, companyId) {
        return (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.id, id), (0, drizzle_orm_1.eq)(quick_messages_db_schema_1.quickMessages.company_id, companyId));
    }
}
exports.DrizzleQuickMessageRepository = DrizzleQuickMessageRepository;
//# sourceMappingURL=quick-messages.repository.js.map