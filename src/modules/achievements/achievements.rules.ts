import { BadRequestError, ForbiddenError } from '../../core/errors/http-errors';

// Catálogo das 6 missões do piloto. Título/tela/ícone de cada uma vivem no
// frontend (conteúdo estático do produto) — aqui só validamos a chave.
export const MISSION_KEYS = [
    'conectar_whatsapp',
    'criar_fila',
    'criar_etiqueta',
    'criar_mensagem_rapida',
    'enviar_primeira_mensagem',
    'agendar_mensagem',
] as const;

export type MissionKey = typeof MISSION_KEYS[number];

export function isMissionKey(key: string): key is MissionKey {
    return (MISSION_KEYS as readonly string[]).includes(key);
}

export class InvalidMissionKeyError extends BadRequestError {
    constructor(key: string) {
        super(`Chave de missão desconhecida: ${key}`);
    }
}

export class GamificationDisabledError extends ForbiddenError {
    constructor() {
        super('A experiência gamer (Conquistas/XP) está desativada para esta empresa.');
    }
}

export interface Tier {
    name: string;
    minMissions: number;
}

export interface RankingRules {
    /** Em ordem crescente de missões; a última é a patente máxima. */
    tiers: readonly Tier[];
    /** Na patente máxima, cada N atendimentos fechados sobe um sub-nível. */
    ticketsPerSubLevel: number;
}

// Patente sobe a cada 2 das 6 missões; depois de Mestre, sub-níveis por atendimentos.
export const DEFAULT_RANKING: RankingRules = {
    tiers: [
        { name: 'Aprendiz',    minMissions: 0 },
        { name: 'Explorador',  minMissions: 2 },
        { name: 'Aventureiro', minMissions: 4 },
        { name: 'Mestre',      minMissions: 6 },
    ],
    ticketsPerSubLevel: 10,
};

export interface PlayerStats {
    completed_missions: string[];
    closed_tickets_count: number;
    xp: number;
}

export interface AchievementProgress extends PlayerStats {
    patente: string;
    /** Só existe na patente máxima: Mestre I, II, III... */
    sub_level: number | null;
}

/** Calcula patente e sub-nível a partir do que o usuário fez. */
export class Ranking {
    constructor(private readonly rules: RankingRules = DEFAULT_RANKING) {}

    progressOf(stats: PlayerStats): AchievementProgress {
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
