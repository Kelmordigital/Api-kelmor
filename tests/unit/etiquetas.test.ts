import { describe, it, expect, vi } from 'vitest';
import { KeywordRule } from '../../src/modules/etiquetas/keyword-rule';
import { AutomaticTagger } from '../../src/modules/etiquetas/automatic-tag-rule.service';
import { EtiquetaService } from '../../src/modules/etiquetas/etiqueta.service';
import type { AutomaticTagRuleRepository } from '../../src/modules/etiquetas/automatic-tag-rule.repository';
import type { EtiquetaRepository } from '../../src/modules/etiquetas/etiqueta.repository';
import type { CompanyPermission } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { NotFoundError } from '../../src/core/errors/http-errors';

describe('KeywordRule', () => {
    it('qualquer variação, sem diferenciar maiúsculas, inclusive dentro de outra palavra', () => {
        const rule = new KeywordRule(' Fralda, frauda ,, fraldinha ');
        expect(rule.matches('Quero FRALDAS tamanho G')).toBe(true);
        expect(rule.matches('tem frauda?')).toBe(true);
        expect(rule.matches('quero whey')).toBe(false);
    });

    it('palavras-chave vazias nunca casam', () => {
        expect(new KeywordRule(' , ').matches('qualquer coisa')).toBe(false);
    });
});

describe('AutomaticTagger', () => {
    function make(enabled: boolean, rules: { keywords: string; etiqueta_ids: string[] }[]) {
        const repo = {
            listByCompany: vi.fn(async () => rules.map((r, i) => ({ id: i + 1, created_at: null, updated_at: null, ...r }))),
        } as unknown as AutomaticTagRuleRepository;
        const permissions = { forCompany: vi.fn(async () => ({ enable_automatic_tags: enabled }) as CompanyPermission) };
        const tagger = { applyToContact: vi.fn(async () => {}) };
        return { repo, tagger, auto: new AutomaticTagger(repo, permissions, tagger) };
    }

    it('chave desligada: não olha as regras', async () => {
        const { auto, repo, tagger } = make(false, [{ keywords: 'fralda', etiqueta_ids: ['t1'] }]);
        await auto.applyFor('c1', 7, 'fralda');
        expect(repo.listByCompany).not.toHaveBeenCalled();
        expect(tagger.applyToContact).not.toHaveBeenCalled();
    });

    it('aplica as etiquetas das regras que casam, cada uma uma vez só', async () => {
        const { auto, tagger } = make(true, [
            { keywords: 'fralda', etiqueta_ids: ['t1', 't2'] },
            { keywords: 'fraldinha', etiqueta_ids: ['t2'] },
            { keywords: 'whey', etiqueta_ids: ['t3'] },
        ]);
        await auto.applyFor('c1', 7, 'Tem fralda? E fraldinha?');
        expect(tagger.applyToContact.mock.calls).toEqual([['c1', 7, 't1'], ['c1', 7, 't2']]);
    });
});

describe('EtiquetaService.getStats', () => {
    it('série dos últimos 7 dias em Brasília, com zero nos dias sem aplicação', async () => {
        const repo = {
            listByCompany: async () => [{ id: 't1', name: 'VIP', color: '#000' }],
            usage: vi.fn(async () => ({
                totals: new Map([['t1', 5]]),
                daily: new Map([['t1', new Map([['2030-01-10', 2], ['2030-01-04', 1]])]]),
            })),
        } as unknown as EtiquetaRepository;
        const service = new EtiquetaService(repo, { hasUser: async () => true, hasContact: async () => true }, () => new Date('2030-01-10T15:00:00Z'));

        const [stat] = await service.getStats('c1');
        expect(stat.total_leads).toBe(5);
        expect(stat.series.map((s) => s.date)).toEqual(['2030-01-04', '2030-01-05', '2030-01-06', '2030-01-07', '2030-01-08', '2030-01-09', '2030-01-10']);
        expect(stat.series.map((s) => s.count)).toEqual([1, 0, 0, 0, 0, 0, 2]);
        expect(repo.usage).toHaveBeenCalledWith(['t1'], new Date('2030-01-04T00:00:00.000-03:00'));
    });

    it('às 22:30 de Brasília (01:30 UTC do dia seguinte) a série ainda termina hoje', async () => {
        const repo = {
            listByCompany: async () => [{ id: 't1', name: 'VIP', color: '#000' }],
            usage: vi.fn(async () => ({ totals: new Map(), daily: new Map() })),
        } as unknown as EtiquetaRepository;
        const service = new EtiquetaService(repo, { hasUser: async () => true, hasContact: async () => true }, () => new Date('2030-01-11T01:30:00Z'));

        const [stat] = await service.getStats('c1');
        expect(stat.series.at(-1)?.date).toBe('2030-01-10');
        expect(stat.series[0].date).toBe('2030-01-04');
    });

    it('aplicar exige etiqueta e contato da empresa', async () => {
        const repo = { findById: async () => null, linkToContact: vi.fn() } as unknown as EtiquetaRepository;
        const service = new EtiquetaService(repo, { hasUser: async () => true, hasContact: async () => true });
        await expect(service.applyToContact('c1', 1, 't1')).rejects.toEqual(new NotFoundError('Etiqueta não encontrada'));
        expect(repo.linkToContact).not.toHaveBeenCalled();
    });
});
