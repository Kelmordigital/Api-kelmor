"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleConfiguracaoGeralRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const company_db_schema_1 = require("../companies/company.db.schema");
const configuracao_geral_db_schema_1 = require("./configuracao-geral.db.schema");
class DrizzleConfiguracaoGeralRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findOrCreatePermissions(companyId) {
        // onConflictDoNothing: duas leituras simultâneas da mesma empresa não colidem
        const [created] = await this.db.insert(configuracao_geral_db_schema_1.companyPermissions)
            .values({ company_id: companyId })
            .onConflictDoNothing({ target: configuracao_geral_db_schema_1.companyPermissions.company_id })
            .returning();
        if (created)
            return created;
        const [existing] = await this.db.select().from(configuracao_geral_db_schema_1.companyPermissions)
            .where((0, drizzle_orm_1.eq)(configuracao_geral_db_schema_1.companyPermissions.company_id, companyId));
        return existing;
    }
    async findMessages(companyId) {
        const [row] = await this.db.select({
            init_message: company_db_schema_1.companies.init_message,
            end_message: company_db_schema_1.companies.end_message,
            transfer_message: company_db_schema_1.companies.transfer_message,
        }).from(company_db_schema_1.companies).where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId));
        return row ?? null;
    }
    async listNotifyEmails(companyId) {
        const rows = await this.db.select({ email: configuracao_geral_db_schema_1.companyEmailNotify.email })
            .from(configuracao_geral_db_schema_1.companyEmailNotify)
            .where((0, drizzle_orm_1.eq)(configuracao_geral_db_schema_1.companyEmailNotify.company_id, companyId));
        return rows.map((r) => r.email);
    }
    async save(companyId, changes) {
        await this.db.transaction(async (tx) => {
            await this.saveMessages(tx, companyId, changes.messages);
            await this.savePermissions(tx, companyId, changes.permissions);
            if (changes.notifyEmails)
                await this.replaceNotifyEmails(tx, companyId, changes.notifyEmails);
        });
    }
    async saveMessages(tx, companyId, messages) {
        if (Object.keys(messages).length === 0)
            return;
        await tx.update(company_db_schema_1.companies)
            .set({ ...messages, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId));
    }
    async savePermissions(tx, companyId, permissions) {
        if (Object.keys(permissions).length === 0)
            return;
        await tx.insert(configuracao_geral_db_schema_1.companyPermissions)
            .values({ ...permissions, company_id: companyId })
            .onConflictDoUpdate({
            target: configuracao_geral_db_schema_1.companyPermissions.company_id,
            set: { ...permissions, updated_at: new Date() },
        });
    }
    async replaceNotifyEmails(tx, companyId, emails) {
        await tx.delete(configuracao_geral_db_schema_1.companyEmailNotify).where((0, drizzle_orm_1.eq)(configuracao_geral_db_schema_1.companyEmailNotify.company_id, companyId));
        if (emails.length > 0) {
            await tx.insert(configuracao_geral_db_schema_1.companyEmailNotify).values(emails.map((email) => ({ company_id: companyId, email })));
        }
    }
}
exports.DrizzleConfiguracaoGeralRepository = DrizzleConfiguracaoGeralRepository;
//# sourceMappingURL=configuracao-geral.repository.js.map