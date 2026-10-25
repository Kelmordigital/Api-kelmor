"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleCompanyDirectory = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const auth_schema_1 = require("../auth/auth.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
class DrizzleCompanyDirectory {
    db;
    constructor(db) {
        this.db = db;
    }
    async hasUser(companyId, userId) {
        const [row] = await this.db.select({ id: auth_schema_1.users.id }).from(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId), (0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId)))
            .limit(1);
        return !!row;
    }
    async hasContact(companyId, contactId) {
        const [row] = await this.db.select({ id: atendimento_db_schema_1.contacts.id }).from(atendimento_db_schema_1.contacts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, contactId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId)))
            .limit(1);
        return !!row;
    }
    async ownedConnectionIds(companyId, ids) {
        if (ids.length === 0)
            return [];
        const rows = await this.db.select({ id: atendimento_db_schema_1.connections.id }).from(atendimento_db_schema_1.connections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.connections.id, ids)));
        return rows.map((r) => r.id);
    }
    async ownedContactIds(companyId, ids) {
        if (ids.length === 0)
            return [];
        const rows = await this.db.select({ id: atendimento_db_schema_1.contacts.id }).from(atendimento_db_schema_1.contacts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.contacts.id, ids)));
        return rows.map((r) => r.id);
    }
}
exports.DrizzleCompanyDirectory = DrizzleCompanyDirectory;
//# sourceMappingURL=company-directory.js.map