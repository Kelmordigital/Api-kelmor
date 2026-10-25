"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleAgendamentoRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const agenda_db_schema_1 = require("./agenda.db.schema");
class DrizzleAgendamentoRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async listStartingBetween(companyId, start, end) {
        return this.db
            .select()
            .from(agenda_db_schema_1.agendamentos)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.company_id, companyId), (0, drizzle_orm_1.between)(agenda_db_schema_1.agendamentos.start_at, start, end)))
            .orderBy((0, drizzle_orm_1.asc)(agenda_db_schema_1.agendamentos.start_at));
    }
    async findById(id, companyId) {
        const [row] = await this.db
            .select()
            .from(agenda_db_schema_1.agendamentos)
            .where(this.byIdInCompany(id, companyId))
            .limit(1);
        return row ?? null;
    }
    async create(companyId, createdBy, data) {
        const [row] = await this.db
            .insert(agenda_db_schema_1.agendamentos)
            .values({ ...data, company_id: companyId, created_by: createdBy })
            .returning();
        return row;
    }
    async update(id, companyId, patch) {
        const [row] = await this.db
            .update(agenda_db_schema_1.agendamentos)
            .set({ ...patch, updated_at: new Date() })
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }
    async setGoogleEventId(id, googleEventId) {
        const [row] = await this.db
            .update(agenda_db_schema_1.agendamentos)
            .set({ google_event_id: googleEventId })
            .where((0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.id, id))
            .returning();
        return row;
    }
    async delete(id, companyId) {
        const [row] = await this.db
            .delete(agenda_db_schema_1.agendamentos)
            .where(this.byIdInCompany(id, companyId))
            .returning();
        return row ?? null;
    }
    byIdInCompany(id, companyId) {
        return (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.id, id), (0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.company_id, companyId));
    }
}
exports.DrizzleAgendamentoRepository = DrizzleAgendamentoRepository;
//# sourceMappingURL=agenda.repository.js.map