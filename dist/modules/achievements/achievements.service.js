"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.achievementsService = exports.GamificationDisabledError = exports.InvalidMissionKeyError = exports.MISSION_KEYS = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const achievements_db_schema_1 = require("./achievements.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
const configuracao_geral_service_1 = require("../configuracao-geral/configuracao-geral.service");
// Catálogo das 6 missões do piloto. Título/tela/ícone de cada uma vivem no
// frontend (conteúdo estático do produto) — aqui só validamos a chave.
exports.MISSION_KEYS = [
    'conectar_whatsapp',
    'criar_fila',
    'criar_etiqueta',
    'criar_mensagem_rapida',
    'enviar_primeira_mensagem',
    'agendar_mensagem',
];
class InvalidMissionKeyError extends Error {
    constructor(key) {
        super(`Chave de missão desconhecida: ${key}`);
        this.name = 'InvalidMissionKeyError';
    }
}
exports.InvalidMissionKeyError = InvalidMissionKeyError;
class GamificationDisabledError extends Error {
    constructor() {
        super('A experiência gamer (Conquistas/XP) está desativada para esta empresa.');
        this.name = 'GamificationDisabledError';
    }
}
exports.GamificationDisabledError = GamificationDisabledError;
// Patente sobe conforme o nº de missões concluídas (a cada ~2 das 6).
const TIERS = [
    { name: 'Aprendiz', minMissions: 0 },
    { name: 'Explorador', minMissions: 2 },
    { name: 'Aventureiro', minMissions: 4 },
    { name: 'Mestre', minMissions: 6 },
];
// Depois de Mestre, cada 10 atendimentos fechados sobe um sub-nível (Mestre I, II, III...).
const TICKETS_PER_SUB_LEVEL = 10;
function isMissionKey(key) {
    return exports.MISSION_KEYS.includes(key);
}
function calcPatente(completedCount) {
    let patente = TIERS[0].name;
    for (const tier of TIERS) {
        if (completedCount >= tier.minMissions)
            patente = tier.name;
    }
    return patente;
}
exports.achievementsService = {
    async getProgress(userId, companyId) {
        const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
        if (!perms.gamification_enabled)
            throw new GamificationDisabledError();
        const [missionRows, [{ closedTicketsCount }], [userRow]] = await Promise.all([
            client_1.db.select({ mission_key: achievements_db_schema_1.userAchievementProgress.mission_key })
                .from(achievements_db_schema_1.userAchievementProgress)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(achievements_db_schema_1.userAchievementProgress.user_id, userId), (0, drizzle_orm_1.eq)(achievements_db_schema_1.userAchievementProgress.company_id, companyId))),
            client_1.db.select({ closedTicketsCount: (0, drizzle_orm_1.count)() })
                .from(atendimento_db_schema_1.tickets)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.closed_by_user_id, userId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3))),
            client_1.db.select({ xp: auth_schema_1.users.xp }).from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId)),
        ]);
        const completedMissions = missionRows.map((r) => r.mission_key);
        const patente = calcPatente(completedMissions.length);
        const subLevel = patente === 'Mestre'
            ? 1 + Math.floor(Number(closedTicketsCount) / TICKETS_PER_SUB_LEVEL)
            : null;
        return {
            completed_missions: completedMissions,
            closed_tickets_count: Number(closedTicketsCount),
            patente,
            sub_level: subLevel,
            xp: userRow?.xp ?? 0,
        };
    },
    // Progresso de vários usuários de uma vez (usado pela tela de Usuários,
    // pra não disparar N requisições — uma consulta agrupada por usuário).
    async getCompanyProgress(companyId, userIds) {
        if (userIds.length === 0)
            return {};
        const [missionRows, ticketRows, userRows] = await Promise.all([
            client_1.db.select({ user_id: achievements_db_schema_1.userAchievementProgress.user_id, mission_key: achievements_db_schema_1.userAchievementProgress.mission_key })
                .from(achievements_db_schema_1.userAchievementProgress)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(achievements_db_schema_1.userAchievementProgress.company_id, companyId), (0, drizzle_orm_1.inArray)(achievements_db_schema_1.userAchievementProgress.user_id, userIds))),
            client_1.db.select({ user_id: atendimento_db_schema_1.tickets.closed_by_user_id, total: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(atendimento_db_schema_1.tickets)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.closed_by_user_id, userIds), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 3)))
                .groupBy(atendimento_db_schema_1.tickets.closed_by_user_id),
            client_1.db.select({ id: auth_schema_1.users.id, xp: auth_schema_1.users.xp }).from(auth_schema_1.users).where((0, drizzle_orm_1.inArray)(auth_schema_1.users.id, userIds)),
        ]);
        const missionsByUser = new Map();
        for (const row of missionRows) {
            const list = missionsByUser.get(row.user_id) ?? [];
            list.push(row.mission_key);
            missionsByUser.set(row.user_id, list);
        }
        const ticketsByUser = new Map();
        for (const row of ticketRows)
            if (row.user_id)
                ticketsByUser.set(row.user_id, row.total);
        const xpByUser = new Map();
        for (const row of userRows)
            xpByUser.set(row.id, row.xp);
        const result = {};
        for (const userId of userIds) {
            const completedMissions = missionsByUser.get(userId) ?? [];
            const closedTicketsCount = ticketsByUser.get(userId) ?? 0;
            const patente = calcPatente(completedMissions.length);
            result[userId] = {
                completed_missions: completedMissions,
                closed_tickets_count: closedTicketsCount,
                patente,
                sub_level: patente === 'Mestre' ? 1 + Math.floor(closedTicketsCount / TICKETS_PER_SUB_LEVEL) : null,
                xp: xpByUser.get(userId) ?? 0,
            };
        }
        return result;
    },
    async completeMission(userId, companyId, missionKey) {
        if (!isMissionKey(missionKey)) {
            throw new InvalidMissionKeyError(missionKey);
        }
        const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
        if (!perms.gamification_enabled)
            throw new GamificationDisabledError();
        await client_1.db.insert(achievements_db_schema_1.userAchievementProgress)
            .values({ user_id: userId, company_id: companyId, mission_key: missionKey })
            .onConflictDoNothing();
        return exports.achievementsService.getProgress(userId, companyId);
    },
};
//# sourceMappingURL=achievements.service.js.map