import { and, eq, count, inArray, sql } from 'drizzle-orm';
import { db } from '../../database/client';
import { userAchievementProgress } from './achievements.db.schema';
import { tickets } from '../atendimento/atendimento.db.schema';
import { users } from '../auth/auth.schema';

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

export class InvalidMissionKeyError extends Error {
    constructor(key: string) {
        super(`Chave de missão desconhecida: ${key}`);
        this.name = 'InvalidMissionKeyError';
    }
}

// Patente sobe conforme o nº de missões concluídas (a cada ~2 das 6).
const TIERS = [
    { name: 'Aprendiz',    minMissions: 0 },
    { name: 'Explorador',  minMissions: 2 },
    { name: 'Aventureiro', minMissions: 4 },
    { name: 'Mestre',      minMissions: 6 },
] as const;

// Depois de Mestre, cada 10 atendimentos fechados sobe um sub-nível (Mestre I, II, III...).
const TICKETS_PER_SUB_LEVEL = 10;

export interface AchievementProgress {
    completed_missions: string[];
    closed_tickets_count: number;
    patente: string;
    sub_level: number | null;
    xp: number;
}

function isMissionKey(key: string): key is MissionKey {
    return (MISSION_KEYS as readonly string[]).includes(key);
}

function calcPatente(completedCount: number): string {
    let patente: string = TIERS[0].name;
    for (const tier of TIERS) {
        if (completedCount >= tier.minMissions) patente = tier.name;
    }
    return patente;
}

export const achievementsService = {

    async getProgress(userId: string, companyId: string): Promise<AchievementProgress> {
        const [missionRows, [{ closedTicketsCount }], [userRow]] = await Promise.all([
            db.select({ mission_key: userAchievementProgress.mission_key })
                .from(userAchievementProgress)
                .where(and(
                    eq(userAchievementProgress.user_id, userId),
                    eq(userAchievementProgress.company_id, companyId),
                )),
            db.select({ closedTicketsCount: count() })
                .from(tickets)
                .where(and(
                    eq(tickets.company_id, companyId),
                    eq(tickets.closed_by_user_id, userId),
                    eq(tickets.status_id, 3),
                )),
            db.select({ xp: users.xp }).from(users).where(eq(users.id, userId)),
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
    async getCompanyProgress(companyId: string, userIds: string[]): Promise<Record<string, AchievementProgress>> {
        if (userIds.length === 0) return {};

        const [missionRows, ticketRows, userRows] = await Promise.all([
            db.select({ user_id: userAchievementProgress.user_id, mission_key: userAchievementProgress.mission_key })
                .from(userAchievementProgress)
                .where(and(
                    eq(userAchievementProgress.company_id, companyId),
                    inArray(userAchievementProgress.user_id, userIds),
                )),
            db.select({ user_id: tickets.closed_by_user_id, total: sql<number>`count(*)::int` })
                .from(tickets)
                .where(and(
                    eq(tickets.company_id, companyId),
                    inArray(tickets.closed_by_user_id, userIds),
                    eq(tickets.status_id, 3),
                ))
                .groupBy(tickets.closed_by_user_id),
            db.select({ id: users.id, xp: users.xp }).from(users).where(inArray(users.id, userIds)),
        ]);

        const missionsByUser = new Map<string, string[]>();
        for (const row of missionRows) {
            const list = missionsByUser.get(row.user_id) ?? [];
            list.push(row.mission_key);
            missionsByUser.set(row.user_id, list);
        }
        const ticketsByUser = new Map<string, number>();
        for (const row of ticketRows) if (row.user_id) ticketsByUser.set(row.user_id, row.total);
        const xpByUser = new Map<string, number>();
        for (const row of userRows) xpByUser.set(row.id, row.xp);

        const result: Record<string, AchievementProgress> = {};
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

    async completeMission(userId: string, companyId: string, missionKey: string): Promise<AchievementProgress> {
        if (!isMissionKey(missionKey)) {
            throw new InvalidMissionKeyError(missionKey);
        }

        await db.insert(userAchievementProgress)
            .values({ user_id: userId, company_id: companyId, mission_key: missionKey })
            .onConflictDoNothing();

        return achievementsService.getProgress(userId, companyId);
    },
};
