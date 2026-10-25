import type { CompanyPermissionsReader } from '../configuracao-geral/configuracao-geral.service';
import type { AchievementRepository } from './achievements.repository';
import { Ranking, type AchievementProgress } from './achievements.rules';
export { MISSION_KEYS, InvalidMissionKeyError, GamificationDisabledError, type AchievementProgress, type MissionKey, } from './achievements.rules';
/** Progresso de vários usuários — o que a tela de Usuários precisa (ISP). */
export interface AchievementProgressReader {
    getCompanyProgress(companyId: string, userIds: string[]): Promise<Record<string, AchievementProgress>>;
}
export declare class AchievementsService implements AchievementProgressReader {
    private readonly repository;
    private readonly permissions;
    private readonly ranking;
    constructor(repository: AchievementRepository, permissions: CompanyPermissionsReader, ranking?: Ranking);
    /** Progresso do próprio usuário; recusado se a empresa desligou a gamificação. */
    getProgress(userId: string, companyId: string): Promise<AchievementProgress>;
    getCompanyProgress(companyId: string, userIds: string[]): Promise<Record<string, AchievementProgress>>;
    completeMission(userId: string, companyId: string, missionKey: string): Promise<AchievementProgress>;
    private assertGamificationEnabled;
}
//# sourceMappingURL=achievements.service.d.ts.map