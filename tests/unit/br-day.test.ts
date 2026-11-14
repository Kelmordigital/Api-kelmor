import { describe, it, expect } from 'vitest';
import { brCalendar, endOfDayBR, startOfDayBR, todayBR } from '../../src/core/dates/br-day';
import { getInterval } from '../../src/modules/atendimento/dashboard.service';

// 14/11/2026 é sábado. 22:30 em Brasília = 01:30 UTC do dia 15 (onde o fuso UTC errava o dia).
const NOITE_SABADO = new Date('2026-11-15T01:30:00Z');

describe('Dia de Brasília nos filtros de relatório', () => {
    it('data sem horário vale o dia inteiro de Brasília (UTC-3)', () => {
        expect(startOfDayBR('2026-11-14').toISOString()).toBe('2026-11-14T03:00:00.000Z');
        expect(endOfDayBR('2026-11-14').toISOString()).toBe('2026-11-15T02:59:59.999Z');
    });

    it('fechado às 19:33 e às 22:30 de Brasília entra no filtro "até 14/11"', () => {
        expect(new Date('2026-11-14T22:33:00Z') <= endOfDayBR('2026-11-14')).toBe(true);
        expect(NOITE_SABADO <= endOfDayBR('2026-11-14')).toBe(true);
        expect(NOITE_SABADO >= startOfDayBR('2026-11-15')).toBe(false);
    });

    it('valor com horário passa sem mudança', () => {
        expect(endOfDayBR('2026-11-14T10:00:00Z').toISOString()).toBe('2026-11-14T10:00:00.000Z');
    });

    it('"hoje" às 22:30 de Brasília ainda é o dia 14', () => {
        expect(todayBR(NOITE_SABADO)).toBe('2026-11-14');
        expect(brCalendar(NOITE_SABADO)).toEqual({ year: 2026, month: 10, day: 14, weekday: 6 });
    });
});

describe('Períodos do painel no calendário de Brasília', () => {
    const iso = (r: { start: Date; end: Date }) => [r.start.toISOString(), r.end.toISOString()];

    it('hoje = 00:00 a 23:59:59.999 de Brasília, mesmo às 22:30', () => {
        expect(iso(getInterval('day', NOITE_SABADO))).toEqual(['2026-11-14T03:00:00.000Z', '2026-11-15T02:59:59.999Z']);
    });

    it('semana = segunda a domingo', () => {
        expect(iso(getInterval('week', NOITE_SABADO))).toEqual(['2026-11-09T03:00:00.000Z', '2026-11-16T02:59:59.999Z']);
        // domingo à noite ainda é a mesma semana
        expect(iso(getInterval('week', new Date('2026-11-16T02:00:00Z')))).toEqual(['2026-11-09T03:00:00.000Z', '2026-11-16T02:59:59.999Z']);
    });

    it('mês e ano', () => {
        expect(iso(getInterval('month', NOITE_SABADO))).toEqual(['2026-11-01T03:00:00.000Z', '2026-12-01T02:59:59.999Z']);
        expect(iso(getInterval('year', NOITE_SABADO))).toEqual(['2026-01-01T03:00:00.000Z', '2027-01-01T02:59:59.999Z']);
        // 31/12 às 22:00 de Brasília ainda é dezembro / o ano corrente
        expect(iso(getInterval('month', new Date('2027-01-01T01:00:00Z')))).toEqual(['2026-12-01T03:00:00.000Z', '2027-01-01T02:59:59.999Z']);
    });
});
