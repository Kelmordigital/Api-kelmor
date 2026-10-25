"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleNotificationRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const auth_schema_1 = require("../auth/auth.schema");
const profile_db_schema_1 = require("../profiles/profile.db.schema");
const notificacao_db_schema_1 = require("./notificacao.db.schema");
class DrizzleNotificationRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async insertForUsers(userIds, notification) {
        if (userIds.length === 0)
            return [];
        return this.db.insert(notificacao_db_schema_1.notifications)
            .values(userIds.map((user_id) => ({ ...notification, user_id })))
            .returning();
    }
    listForUser(userId, limit) {
        return this.db.select().from(notificacao_db_schema_1.notifications)
            .where((0, drizzle_orm_1.eq)(notificacao_db_schema_1.notifications.user_id, userId))
            .orderBy((0, drizzle_orm_1.desc)(notificacao_db_schema_1.notifications.created_at), (0, drizzle_orm_1.desc)(notificacao_db_schema_1.notifications.id))
            .limit(limit);
    }
    async unreadCount(userId) {
        const [{ total }] = await this.db.select({ total: (0, drizzle_orm_1.count)() }).from(notificacao_db_schema_1.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(notificacao_db_schema_1.notifications.user_id, userId), (0, drizzle_orm_1.isNull)(notificacao_db_schema_1.notifications.read_at)));
        return Number(total);
    }
    async markRead(id, userId) {
        const [row] = await this.db.update(notificacao_db_schema_1.notifications)
            .set({ read_at: (0, drizzle_orm_1.sql) `coalesce(${notificacao_db_schema_1.notifications.read_at}, now())` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(notificacao_db_schema_1.notifications.id, id), (0, drizzle_orm_1.eq)(notificacao_db_schema_1.notifications.user_id, userId)))
            .returning({ id: notificacao_db_schema_1.notifications.id });
        return !!row;
    }
    async markAllRead(userId) {
        await this.db.update(notificacao_db_schema_1.notifications)
            .set({ read_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(notificacao_db_schema_1.notifications.user_id, userId), (0, drizzle_orm_1.isNull)(notificacao_db_schema_1.notifications.read_at)));
    }
    async companyAdmins(companyId) {
        const rows = await this.db.select({ id: auth_schema_1.users.id }).from(auth_schema_1.users)
            .innerJoin(profile_db_schema_1.profiles, (0, drizzle_orm_1.eq)(profile_db_schema_1.profiles.id, auth_schema_1.users.profile_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId), (0, drizzle_orm_1.eq)(profile_db_schema_1.profiles.tag, 'admin')));
        return rows.map((r) => r.id);
    }
}
exports.DrizzleNotificationRepository = DrizzleNotificationRepository;
//# sourceMappingURL=notificacao.repository.js.map