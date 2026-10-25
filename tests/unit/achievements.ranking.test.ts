import { describe, it, expect } from 'vitest';
import { Ranking, MISSION_KEYS, isMissionKey } from '../../src/modules/achievements/achievements.rules';

/** Patente e sub-nível, sem banco. */

const stats = (missions: number, closed = 0, xp = 0) => ({
    completed_missions: MISSION_KEYS.slice(0, missions) as unknown as string[],
    closed_tickets_count: closed,
    xp,
});

describe('Ranking (regras padrão)', () => {
    const ranking = new Ranking();

    it.each([
        [0, 'Aprendiz'], [1, 'Aprendiz'],
        [2, 'Explorador'], [3, 'Explorador'],
        [4, 'Aventureiro'], [5, 'Aventureiro'],
        [6, 'Mestre'],
    ])('%i missões → %s', (missions, patente) => {
        expect(ranking.progressOf(stats(missions)).patente).toBe(patente);
    });

    it('sub-nível só em Mestre: começa em 1 e sobe a cada 10 atendimentos fechados', () => {
        expect(ranking.progressOf(stats(5, 50)).sub_level).toBeNull();
        expect(ranking.progressOf(stats(6, 0)).sub_level).toBe(1);
        expect(ranking.progressOf(stats(6, 9)).sub_level).toBe(1);
        expect(ranking.progressOf(stats(6, 10)).sub_level).toBe(2);
        expect(ranking.progressOf(stats(6, 35)).sub_level).toBe(4);
    });

    it('repassa missões, atendimentos e XP', () => {
        expect(ranking.progressOf(stats(1, 3, 120))).toEqual({
            completed_missions: ['conectar_whatsapp'], closed_tickets_count: 3, xp: 120, patente: 'Aprendiz', sub_level: null,
        });
    });
});

describe('Ranking com regras próprias (OCP)', () => {
    it('trocar patentes e ritmo de sub-nível não exige mudar o cálculo', () => {
        const ranking = new Ranking({
            tiers: [{ name: 'Bronze', minMissions: 0 }, { name: 'Ouro', minMissions: 1 }],
            ticketsPerSubLevel: 5,
        });
        expect(ranking.progressOf(stats(0)).patente).toBe('Bronze');
        expect(ranking.progressOf(stats(1, 5))).toMatchObject({ patente: 'Ouro', sub_level: 2 });
    });
});

describe('isMissionKey', () => {
    it('aceita só as chaves do catálogo', () => {
        expect(MISSION_KEYS.every(isMissionKey)).toBe(true);
        expect(isMissionKey('voar')).toBe(false);
    });
});
