import { describe, it, expect } from 'vitest';
import { formatAlertMessage } from '../monitoring.service';

const baseAlert = {
    status: 'firing' as const,
    labels: { alertname: 'DiscoEnchendo', severity: 'warning' },
    annotations: { summary: 'Disco 87% usado (limite 85%)' },
    startsAt: '2026-07-07T14:32:00Z',
};

describe('formatAlertMessage', () => {
    it('retorna null quando não há alertas', () => {
        expect(formatAlertMessage(undefined)).toBeNull();
        expect(formatAlertMessage({ alerts: [] })).toBeNull();
    });

    it('formata alerta warning com resumo e data em pt-BR', () => {
        const msg = formatAlertMessage({ alerts: [baseAlert] })!;
        expect(msg).toContain('ALERTA — Kelmor');
        expect(msg).toContain('⚠️');
        expect(msg).toContain('DiscoEnchendo');
        expect(msg).toContain('Disco 87% usado (limite 85%)');
        expect(msg).toContain('07/07/2026'); // 14:32Z = 11:32 em América/São Paulo
        expect(msg).toContain('11:32');
    });

    it('usa 🚨 para severity critical e ✅ para resolved', () => {
        const critical = { ...baseAlert, labels: { alertname: 'PostgresDown', severity: 'critical' } };
        expect(formatAlertMessage({ alerts: [critical] })).toContain('🚨');
        const resolved = { ...baseAlert, status: 'resolved' as const };
        expect(formatAlertMessage({ alerts: [resolved] })).toContain('✅');
    });

    it('limita a 5 alertas por mensagem', () => {
        const many = Array.from({ length: 8 }, (_, i) => ({
            ...baseAlert,
            labels: { alertname: `Alerta${i}`, severity: 'warning' },
        }));
        const msg = formatAlertMessage({ alerts: many })!;
        expect(msg).toContain('Alerta4');
        expect(msg).not.toContain('Alerta5');
    });

    it('retorna null quando alerts não é um array (payload malformado)', () => {
        expect(formatAlertMessage({ alerts: 'malformado' as any })).toBeNull();
    });
});
