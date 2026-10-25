"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleCampanhaRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const campanha_db_schema_1 = require("./campanha.db.schema");
class DrizzleCampanhaRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async options(companyId) {
        const [conns, cts] = await Promise.all([
            this.db.select({ id: atendimento_db_schema_1.connections.id, name: atendimento_db_schema_1.connections.name, status: atendimento_db_schema_1.connections.status })
                .from(atendimento_db_schema_1.connections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId)),
            this.db.select({ id: atendimento_db_schema_1.contacts.id, name: atendimento_db_schema_1.contacts.name, number: atendimento_db_schema_1.contacts.number })
                .from(atendimento_db_schema_1.contacts).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId)),
        ]);
        return { connections: conns, contacts: cts };
    }
    listTexts(companyId) {
        return this.db.select().from(campanha_db_schema_1.scheduledMessageTexts)
            .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.company_id, companyId))
            .orderBy((0, drizzle_orm_1.asc)(campanha_db_schema_1.scheduledMessageTexts.type), (0, drizzle_orm_1.asc)(campanha_db_schema_1.scheduledMessageTexts.id));
    }
    async lastTextPosition(companyId) {
        const [{ last }] = await this.db.select({ last: (0, drizzle_orm_1.sql) `coalesce(max(${campanha_db_schema_1.scheduledMessageTexts.type}), 0)::int` })
            .from(campanha_db_schema_1.scheduledMessageTexts)
            .where((0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.company_id, companyId));
        return last;
    }
    async insertTexts(companyId, texts) {
        if (texts.length === 0)
            return [];
        return this.db.insert(campanha_db_schema_1.scheduledMessageTexts)
            .values(texts.map((t) => ({ ...t, company_id: companyId })))
            .returning();
    }
    async updateText(id, companyId, data) {
        const [row] = await this.db.update(campanha_db_schema_1.scheduledMessageTexts)
            .set(data)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.id, id), (0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.company_id, companyId)))
            .returning();
        return row ?? null;
    }
    async deleteText(id, companyId) {
        const [row] = await this.db.delete(campanha_db_schema_1.scheduledMessageTexts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.id, id), (0, drizzle_orm_1.eq)(campanha_db_schema_1.scheduledMessageTexts.company_id, companyId)))
            .returning({ id: campanha_db_schema_1.scheduledMessageTexts.id });
        return !!row;
    }
}
exports.DrizzleCampanhaRepository = DrizzleCampanhaRepository;
//# sourceMappingURL=campanha.repository.js.map