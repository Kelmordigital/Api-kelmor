"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.botsRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const bots_db_schema_1 = require("./bots.db.schema");
exports.botsRepository = {
    // ── Bots ────────────────────────────────────────────────────────────────
    async findByCompany(companyId) {
        return client_1.db.select().from(bots_db_schema_1.bots)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bots.company_id, companyId), (0, drizzle_orm_1.isNull)(bots_db_schema_1.bots.deleted_at)));
    },
    async findById(id, companyId) {
        const [row] = await client_1.db.select().from(bots_db_schema_1.bots)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bots.id, id), (0, drizzle_orm_1.eq)(bots_db_schema_1.bots.company_id, companyId), (0, drizzle_orm_1.isNull)(bots_db_schema_1.bots.deleted_at)));
        return row;
    },
    async findDefaultActive(companyId) {
        const [row] = await client_1.db.select().from(bots_db_schema_1.bots)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bots.company_id, companyId), (0, drizzle_orm_1.eq)(bots_db_schema_1.bots.active, true), (0, drizzle_orm_1.eq)(bots_db_schema_1.bots.default_bot, true), (0, drizzle_orm_1.isNull)(bots_db_schema_1.bots.deleted_at)));
        return row;
    },
    async create(data) {
        const [row] = await client_1.db.insert(bots_db_schema_1.bots).values(data).returning();
        return row;
    },
    async update(id, companyId, data) {
        const [row] = await client_1.db.update(bots_db_schema_1.bots)
            .set(data)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bots.id, id), (0, drizzle_orm_1.eq)(bots_db_schema_1.bots.company_id, companyId)))
            .returning();
        return row;
    },
    async softDelete(id, companyId) {
        await client_1.db.update(bots_db_schema_1.bots)
            .set({ deleted_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bots.id, id), (0, drizzle_orm_1.eq)(bots_db_schema_1.bots.company_id, companyId)));
    },
    async clearDefault(companyId) {
        await client_1.db.update(bots_db_schema_1.bots)
            .set({ default_bot: false })
            .where((0, drizzle_orm_1.eq)(bots_db_schema_1.bots.company_id, companyId));
    },
    // ── Nodes ────────────────────────────────────────────────────────────────
    async getNodes(botId, companyId) {
        return client_1.db.select().from(bots_db_schema_1.bot_nodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bot_nodes.bot_id, botId), (0, drizzle_orm_1.eq)(bots_db_schema_1.bot_nodes.company_id, companyId)));
    },
    async deleteNodes(botId, companyId) {
        await client_1.db.delete(bots_db_schema_1.bot_nodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bot_nodes.bot_id, botId), (0, drizzle_orm_1.eq)(bots_db_schema_1.bot_nodes.company_id, companyId)));
    },
    async insertNodes(nodes) {
        if (nodes.length === 0)
            return;
        await client_1.db.insert(bots_db_schema_1.bot_nodes).values(nodes);
    },
    // ── Conversations ────────────────────────────────────────────────────────
    async findActiveConversation(companyId, botId, phone) {
        const [row] = await client_1.db.select().from(bots_db_schema_1.bot_conversations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bot_conversations.company_id, companyId), (0, drizzle_orm_1.eq)(bots_db_schema_1.bot_conversations.bot_id, botId), (0, drizzle_orm_1.eq)(bots_db_schema_1.bot_conversations.contact_phone, phone), (0, drizzle_orm_1.eq)(bots_db_schema_1.bot_conversations.status, 'active')));
        return row;
    },
    async createConversation(data) {
        const [row] = await client_1.db.insert(bots_db_schema_1.bot_conversations).values(data).returning();
        return row;
    },
    async updateConversation(id, data) {
        await client_1.db.update(bots_db_schema_1.bot_conversations)
            .set({ ...data, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(bots_db_schema_1.bot_conversations.id, id));
    },
};
//# sourceMappingURL=bots.repository.js.map