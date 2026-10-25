"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleApiMessageLogRepository = exports.DrizzleApiKeyRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const api_messages_db_schema_1 = require("./api-messages.db.schema");
class DrizzleApiKeyRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async save(companyId, hash, prefix) {
        await this.db.insert(api_messages_db_schema_1.companyApiKeys)
            .values({ company_id: companyId, key_hash: hash, key_prefix: prefix })
            .onConflictDoUpdate({
            target: api_messages_db_schema_1.companyApiKeys.company_id,
            set: { key_hash: hash, key_prefix: prefix, created_at: new Date(), revoked_at: null },
        });
    }
    async findByCompany(companyId) {
        const [row] = await this.db.select().from(api_messages_db_schema_1.companyApiKeys).where((0, drizzle_orm_1.eq)(api_messages_db_schema_1.companyApiKeys.company_id, companyId)).limit(1);
        return row ?? null;
    }
    async revoke(companyId) {
        await this.db.update(api_messages_db_schema_1.companyApiKeys).set({ revoked_at: new Date() }).where((0, drizzle_orm_1.eq)(api_messages_db_schema_1.companyApiKeys.company_id, companyId));
    }
    async companyByActiveHash(hash) {
        const [row] = await this.db.select({ company_id: api_messages_db_schema_1.companyApiKeys.company_id }).from(api_messages_db_schema_1.companyApiKeys)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(api_messages_db_schema_1.companyApiKeys.key_hash, hash), (0, drizzle_orm_1.isNull)(api_messages_db_schema_1.companyApiKeys.revoked_at)))
            .limit(1);
        return row?.company_id ?? null;
    }
}
exports.DrizzleApiKeyRepository = DrizzleApiKeyRepository;
class DrizzleApiMessageLogRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async record(entry) {
        const [row] = await this.db.insert(api_messages_db_schema_1.apiMessagesLog).values(entry).returning({ id: api_messages_db_schema_1.apiMessagesLog.id });
        return row.id;
    }
    async linkTicket(logId, ticketId) {
        await this.db.update(api_messages_db_schema_1.apiMessagesLog).set({ ticket_id: ticketId }).where((0, drizzle_orm_1.eq)(api_messages_db_schema_1.apiMessagesLog.id, logId));
    }
}
exports.DrizzleApiMessageLogRepository = DrizzleApiMessageLogRepository;
//# sourceMappingURL=api-messages.repository.js.map