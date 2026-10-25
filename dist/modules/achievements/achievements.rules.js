"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ranking = exports.DEFAULT_RANKING = exports.GamificationDisabledError = exports.InvalidMissionKeyError = exports.MISSION_KEYS = void 0;
exports.isMissionKey = isMissionKey;
const http_errors_1 = require("../../core/errors/http-errors");
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
function isMissionKey(key) {
    return exports.MISSION_KEYS.includes(key);
}
class InvalidMissionKeyError extends http_errors_1.BadRequestError {
    constructor(key) {
        super(`Chave de missão desconhecida: ${key}`);
    }
}
exports.InvalidMissionKeyError = InvalidMissionKeyError;
class GamificationDisabledError extends http_errors_1.ForbiddenError {
    constructor() {
        super('A experiência gamer (Conquistas/XP) está desativada para esta empresa.');
    }
}
exports.GamificationDisabledError = GamificationDisabledError;
// Patente sobe a cada 2 das 6 missões; depois de Mestre, sub-níveis por atendimentos.
exports.DEFAULT_RANKING = {
    tiers: [
        { name: 'Aprendiz', minMissions: 0 },
        { name: 'Explorador', minMissions: 2 },
        { name: 'Aventureiro', minMissions: 4 },
        { name: 'Mestre', minMissions: 6 },
    ],
    ticketsPerSubLevel: 10,
};
/** Calcula patente e sub-nível a partir do que o usuário fez. */
class Ranking {
    rules;
    constructor(rules = exports.DEFAULT_RANKING) {
        this.rules = rules;
    }
    progressOf(stats) {
        const tiers = this.rules.tiers;
        const done = stats.completed_missions.length;
        const tier = [...tiers].reverse().find((t) => done >= t.minMissions) ?? tiers[0];
        const isTopTier = tier === tiers[tiers.length - 1];
        return {
            ...stats,
            patente: tier.name,
            sub_level: isTopTier ? 1 + Math.floor(stats.closed_tickets_count / this.rules.ticketsPerSubLevel) : null,
        };
    }
}
exports.Ranking = Ranking;
//# sourceMappingURL=achievements.rules.js.map