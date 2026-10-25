import { BadRequestError, ForbiddenError } from '../../core/errors/http-errors';
export declare const MISSION_KEYS: readonly ["conectar_whatsapp", "criar_fila", "criar_etiqueta", "criar_mensagem_rapida", "enviar_primeira_mensagem", "agendar_mensagem"];
export type MissionKey = typeof MISSION_KEYS[number];
export declare function isMissionKey(key: string): key is MissionKey;
export declare class InvalidMissionKeyError extends BadRequestError {
    constructor(key: string);
}
export declare class GamificationDisabledError extends ForbiddenError {
    constructor();
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
export declare const DEFAULT_RANKING: RankingRules;
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
export declare class Ranking {
    private readonly rules;
    constructor(rules?: RankingRules);
    progressOf(stats: PlayerStats): AchievementProgress;
}
//# sourceMappingURL=achievements.rules.d.ts.map