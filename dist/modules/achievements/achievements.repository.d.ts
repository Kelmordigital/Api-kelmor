import type { DB } from '../../database/client';
import type { MissionKey, PlayerStats } from './achievements.rules';
export interface AchievementRepository {
    /** Missões, atendimentos fechados e XP de cada usuário pedido, dentro da empresa. */
    statsOf(companyId: string, userIds: string[]): Promise<Map<string, PlayerStats>>;
    /** Idempotente: concluir de novo não duplica. */
    saveCompletion(userId: string, companyId: string, missionKey: MissionKey): Promise<void>;
}
export declare class DrizzleAchievementRepository implements AchievementRepository {
    private readonly db;
    constructor(db: DB);
    statsOf(companyId: string, userIds: string[]): Promise<Map<string, PlayerStats>>;
    saveCompletion(userId: string, companyId: string, missionKey: MissionKey): Promise<void>;
}
//# sourceMappingURL=achievements.repository.d.ts.map