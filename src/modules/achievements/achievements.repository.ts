import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { userAchievementProgress } from './achievements.db.schema';
import { tickets } from '../atendimento/atendimento.db.schema';
import { users } from '../auth/auth.schema';
import type { MissionKey, PlayerStats } from './achievements.rules';

/** Status de ticket "fechado" (at_ticket_status). */
const CLOSED_TICKET_STATUS = 3;

export interface AchievementRepository {
    /** Missões, atendimentos fechados e XP de cada usuário pedido, dentro da empresa. */
    statsOf(companyId: string, userIds: string[]): Promise<Map<string, PlayerStats>>;
    /** Idempotente: concluir de novo não duplica. */
    saveCompletion(userId: string, companyId: string, missionKey: MissionKey): Promise<void>;
}

export class DrizzleAchievementRepository implements AchievementRepository {
    constructor(private readonly db: DB) {}

    async statsOf(companyId: string, userIds: string[]): Promise<Map<string, PlayerStats>> {
        const stats = new Map<string, PlayerStats>(
            userIds.map((id) => [id, { completed_missions: [], closed_tickets_count: 0, xp: 0 }]),
        );
        if (userIds.length === 0) return stats;

        const [missionRows, ticketRows, userRows] = await Promise.all([
            this.db.select({ user_id: userAchievementProgress.user_id, mission_key: userAchievementProgress.mission_key })
                .from(userAchievementProgress)
                .where(and(
                    eq(userAchievementProgress.company_id, companyId),
                    inArray(userAchievementProgress.user_id, userIds),
                )),
            this.db.select({ user_id: tickets.closed_by_user_id, total: sql<number>`count(*)::int` })
                .from(tickets)
                .where(and(
                    eq(tickets.company_id, companyId),
                    inArray(tickets.closed_by_user_id, userIds),
                    eq(tickets.status_id, CLOSED_TICKET_STATUS),
                ))
                .groupBy(tickets.closed_by_user_id),
            this.db.select({ id: users.id, xp: users.xp }).from(users).where(inArray(users.id, userIds)),
        ]);

        for (const row of missionRows) stats.get(row.user_id)?.completed_missions.push(row.mission_key);
        for (const row of ticketRows) if (row.user_id) stats.get(row.user_id)!.closed_tickets_count = row.total;
        for (const row of userRows) stats.get(row.id)!.xp = row.xp;
        return stats;
    }

    async saveCompletion(userId: string, companyId: string, missionKey: MissionKey): Promise<void> {
        await this.db.insert(userAchievementProgress)
            .values({ user_id: userId, company_id: companyId, mission_key: missionKey })
            .onConflictDoNothing();
    }
}
