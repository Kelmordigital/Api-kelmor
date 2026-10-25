"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AchievementsService = exports.GamificationDisabledError = exports.InvalidMissionKeyError = exports.MISSION_KEYS = void 0;
const achievements_rules_1 = require("./achievements.rules");
var achievements_rules_2 = require("./achievements.rules");
Object.defineProperty(exports, "MISSION_KEYS", { enumerable: true, get: function () { return achievements_rules_2.MISSION_KEYS; } });
Object.defineProperty(exports, "InvalidMissionKeyError", { enumerable: true, get: function () { return achievements_rules_2.InvalidMissionKeyError; } });
Object.defineProperty(exports, "GamificationDisabledError", { enumerable: true, get: function () { return achievements_rules_2.GamificationDisabledError; } });
class AchievementsService {
    repository;
    permissions;
    ranking;
    constructor(repository, permissions, ranking = new achievements_rules_1.Ranking()) {
        this.repository = repository;
        this.permissions = permissions;
        this.ranking = ranking;
    }
    /** Progresso do próprio usuário; recusado se a empresa desligou a gamificação. */
    async getProgress(userId, companyId) {
        await this.assertGamificationEnabled(companyId);
        const stats = await this.repository.statsOf(companyId, [userId]);
        return this.ranking.progressOf(stats.get(userId));
    }
    // Progresso de vários usuários de uma vez (tela de Usuários), numa consulta
    // agrupada em vez de N requisições.
    async getCompanyProgress(companyId, userIds) {
        const stats = await this.repository.statsOf(companyId, userIds);
        return Object.fromEntries([...stats].map(([userId, s]) => [userId, this.ranking.progressOf(s)]));
    }
    async completeMission(userId, companyId, missionKey) {
        if (!(0, achievements_rules_1.isMissionKey)(missionKey))
            throw new achievements_rules_1.InvalidMissionKeyError(missionKey);
        await this.assertGamificationEnabled(companyId);
        await this.repository.saveCompletion(userId, companyId, missionKey);
        return this.getProgress(userId, companyId);
    }
    async assertGamificationEnabled(companyId) {
        const perms = await this.permissions.forCompany(companyId);
        if (!perms.gamification_enabled)
            throw new achievements_rules_1.GamificationDisabledError();
    }
}
exports.AchievementsService = AchievementsService;
//# sourceMappingURL=achievements.service.js.map