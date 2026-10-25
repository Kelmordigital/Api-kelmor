"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleAchievementRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const achievements_db_schema_1 = require("./achievements.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
/** Status de ticket "fechado" (at_ticket_status). */
const CLOSED_TICKET_STATUS = 3;
class DrizzleAchievementRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async statsOf(companyId, userIds) {
        const stats = new Map(userIds.map((id) => [id, { completed_missions: [], closed_tickets_count: 0, xp: 0 }]));
        if (userIds.length === 0)
            return stats;
        const [missionRows, ticketRows, userRows] = await Promise.all([
            this.db.select({ user_id: achievements_db_schema_1.userAchievementProgress.user_id, mission_key: achievements_db_schema_1.userAchievementProgress.mission_key })
                .from(achievements_db_schema_1.userAchievementProgress)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(achievements_db_schema_1.userAchievementProgress.company_id, companyId), (0, drizzle_orm_1.inArray)(achievements_db_schema_1.userAchievementProgress.user_id, userIds))),
            this.db.select({ user_id: atendimento_db_schema_1.tickets.closed_by_user_id, total: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(atendimento_db_schema_1.tickets)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.closed_by_user_id, userIds), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, CLOSED_TICKET_STATUS)))
                .groupBy(atendimento_db_schema_1.tickets.closed_by_user_id),
            this.db.select({ id: auth_schema_1.users.id, xp: auth_schema_1.users.xp }).from(auth_schema_1.users).where((0, drizzle_orm_1.inArray)(auth_schema_1.users.id, userIds)),
        ]);
        for (const row of missionRows)
            stats.get(row.user_id)?.completed_missions.push(row.mission_key);
        for (const row of ticketRows)
            if (row.user_id)
                stats.get(row.user_id).closed_tickets_count = row.total;
        for (const row of userRows)
            stats.get(row.id).xp = row.xp;
        return stats;
    }
    async saveCompletion(userId, companyId, missionKey) {
        await this.db.insert(achievements_db_schema_1.userAchievementProgress)
            .values({ user_id: userId, company_id: companyId, mission_key: missionKey })
            .onConflictDoNothing();
    }
}
exports.DrizzleAchievementRepository = DrizzleAchievementRepository;
//# sourceMappingURL=achievements.repository.js.map