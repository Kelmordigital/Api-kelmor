import type { CompanyPermissionsReader } from '../configuracao-geral/configuracao-geral.service';
import type { AchievementRepository } from './achievements.repository';
import {
    GamificationDisabledError, InvalidMissionKeyError, Ranking, isMissionKey, type AchievementProgress,
} from './achievements.rules';

export {
    MISSION_KEYS, InvalidMissionKeyError, GamificationDisabledError, type AchievementProgress, type MissionKey,
} from './achievements.rules';

/** Progresso de vários usuários — o que a tela de Usuários precisa (ISP). */
export interface AchievementProgressReader {
    getCompanyProgress(companyId: string, userIds: string[]): Promise<Record<string, AchievementProgress>>;
}

export class AchievementsService implements AchievementProgressReader {
    constructor(
        private readonly repository: AchievementRepository,
        private readonly permissions: CompanyPermissionsReader,
        private readonly ranking: Ranking = new Ranking(),
    ) {}

    /** Progresso do próprio usuário; recusado se a empresa desligou a gamificação. */
    async getProgress(userId: string, companyId: string): Promise<AchievementProgress> {
        await this.assertGamificationEnabled(companyId);
        const stats = await this.repository.statsOf(companyId, [userId]);
        return this.ranking.progressOf(stats.get(userId)!);
    }

    // Progresso de vários usuários de uma vez (tela de Usuários), numa consulta
    // agrupada em vez de N requisições.
    async getCompanyProgress(companyId: string, userIds: string[]): Promise<Record<string, AchievementProgress>> {
        const stats = await this.repository.statsOf(companyId, userIds);
        return Object.fromEntries([...stats].map(([userId, s]) => [userId, this.ranking.progressOf(s)]));
    }

    async completeMission(userId: string, companyId: string, missionKey: string): Promise<AchievementProgress> {
        if (!isMissionKey(missionKey)) throw new InvalidMissionKeyError(missionKey);
        await this.assertGamificationEnabled(companyId);
        await this.repository.saveCompletion(userId, companyId, missionKey);
        return this.getProgress(userId, companyId);
    }

    private async assertGamificationEnabled(companyId: string): Promise<void> {
        const perms = await this.permissions.forCompany(companyId);
        if (!perms.gamification_enabled) throw new GamificationDisabledError();
    }
}
