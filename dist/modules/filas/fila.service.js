"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filaService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
exports.filaService = {
    async list(companyId) {
        return client_1.db
            .select()
            .from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId));
    },
    async findById(id, companyId) {
        const [row] = await client_1.db
            .select()
            .from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId)))
            .limit(1);
        return row ?? null;
    },
    async create(companyId, payload) {
        const [row] = await client_1.db
            .insert(atendimento_db_schema_1.queues)
            .values({ company_id: companyId, ...payload })
            .returning();
        return row;
    },
    async update(id, companyId, payload) {
        const [row] = await client_1.db
            .update(atendimento_db_schema_1.queues)
            .set(payload)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId)))
            .returning();
        return row ?? null;
    },
    async remove(id, companyId) {
        const [row] = await client_1.db
            .delete(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId)))
            .returning();
        return !!row;
    },
};
//# sourceMappingURL=fila.service.js.map