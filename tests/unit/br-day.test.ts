import { describe, it, expect } from 'vitest';
import { endOfDayBR, startOfDayBR } from '../../src/core/dates/br-day';

describe('Dia de Brasília nos filtros de relatório', () => {
    it('data sem horário vale o dia inteiro de Brasília (UTC-3)', () => {
        expect(startOfDayBR('2026-11-14').toISOString()).toBe('2026-11-14T03:00:00.000Z');
        expect(endOfDayBR('2026-11-14').toISOString()).toBe('2026-11-15T02:59:59.999Z');
    });

    it('fechado às 19:33 de Brasília entra no filtro "até 14/11"', () => {
        const closedAt = new Date('2026-11-14T22:33:00Z'); // 19:33 em Brasília
        expect(closedAt <= endOfDayBR('2026-11-14')).toBe(true);
        expect(closedAt >= startOfDayBR('2026-11-14')).toBe(true);
    });

    it('valor com horário passa sem mudança', () => {
        expect(endOfDayBR('2026-11-14T10:00:00Z').toISOString()).toBe('2026-11-14T10:00:00.000Z');
    });
});
