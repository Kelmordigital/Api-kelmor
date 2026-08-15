export declare const MISSION_KEYS: readonly ["conectar_whatsapp", "criar_fila", "criar_etiqueta", "criar_mensagem_rapida", "enviar_primeira_mensagem", "agendar_mensagem"];
export type MissionKey = typeof MISSION_KEYS[number];
export declare class InvalidMissionKeyError extends Error {
    constructor(key: string);
}
export declare class GamificationDisabledError extends Error {
    constructor();
}
export interface AchievementProgress {
    completed_missions: string[];
    closed_tickets_count: number;
    patente: string;
    sub_level: number | null;
    xp: number;
}
export declare const achievementsService: {
    getProgress(userId: string, companyId: string): Promise<AchievementProgress>;
    getCompanyProgress(companyId: string, userIds: string[]): Promise<Record<string, AchievementProgress>>;
    completeMission(userId: string, companyId: string, missionKey: string): Promise<AchievementProgress>;
};
//# sourceMappingURL=achievements.service.d.ts.map