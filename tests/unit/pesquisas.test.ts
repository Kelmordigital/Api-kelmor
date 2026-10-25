import { describe, it, expect, vi } from 'vitest';
import { SurveyQuestion, answerChanges } from '../../src/modules/pesquisas/survey-question';
import { SurveyFlowService } from '../../src/modules/pesquisas/pesquisa.service';
import type { ResearchRepository } from '../../src/modules/pesquisas/pesquisa.repository';
import type { Research, ResearchAnswer } from '../../src/modules/pesquisas/pesquisa.db.schema';

const opt = (id: number, title: string) => ({ id, title, research_id: 1, created_at: null }) as ResearchAnswer;

describe('SurveyQuestion', () => {
    const question = new SurveyQuestion('Como foi?', [opt(12, 'Ruim'), opt(10, 'Ótimo'), opt(11, 'Bom')]);

    it('numera as opções na ordem de criação, venha a lista como vier', () => {
        expect(question.message()).toBe('Como foi?\n\n1. Ótimo\n2. Bom\n3. Ruim\n\nResponda com o número da sua opção.');
    });

    it('lê a resposta pelo número (mesma numeração da mensagem) ou pelo texto exato', () => {
        expect(question.answerFor(' 2 ')?.title).toBe('Bom');
        expect(question.answerFor('ÓTIMO')?.title).toBe('Ótimo');
        expect(question.answerFor('4')).toBeNull();
        expect(question.answerFor('0')).toBeNull();
        expect(question.answerFor('foi bom')).toBeNull();
    });
});

describe('answerChanges', () => {
    it('mantém as opções de mesmo texto, remove as que saíram e acrescenta as novas', () => {
        expect(answerChanges([{ id: 1, title: 'A' }, { id: 2, title: 'B' }, { id: 3, title: 'C' }], ['C', 'A', 'D']))
            .toEqual({ keepIds: [3, 1], removeIds: [2], addTitles: ['D'] });
    });

    it('opções repetidas: cada uma casa com uma existente', () => {
        expect(answerChanges([{ id: 1, title: 'A' }], ['A', 'A'])).toEqual({ keepIds: [1], removeIds: [], addTitles: ['A'] });
    });
});

describe('SurveyFlowService', () => {
    const research = { id: 1, name: 'NPS' } as Research;
    const ticket = { id: 50, company_id: 'c1', contact_id: 7, connection_id: 3 };

    function make(answers: ResearchAnswer[], target: string | null = '5511900000001') {
        const events: string[] = [];
        const repo = {
            answersOf: vi.fn(async () => answers),
            createPending: vi.fn(async () => { events.push('pendente'); }),
            latestPending: vi.fn(async () => null),
            markAnswered: vi.fn(async () => {}),
        } as unknown as ResearchRepository;
        const channel = {
            targetFor: vi.fn(async () => target),
            send: vi.fn(async (_t: unknown, to: string, text: string) => { events.push(`envia ${to}: ${text.split('\n')[0]}`); }),
        };
        const closer = { finalizeAfterResearch: vi.fn(async () => {}) };
        return { repo, channel, closer, events, flow: new SurveyFlowService(repo, channel, closer) };
    }

    it('registra a pesquisa pendente e envia a pergunta', async () => {
        const { flow, events } = make([opt(1, 'Sim')]);
        await flow.sendSurveyQuestion(ticket, research);
        expect(events).toEqual(['pendente', 'envia 5511900000001: NPS']);
    });

    it('sem opções ou sem como contatar: não envia nem deixa pendência', async () => {
        for (const ctx of [make([]), make([opt(1, 'Sim')], null)]) {
            await ctx.flow.sendSurveyQuestion(ticket, research);
            expect(ctx.events).toEqual([]);
        }
    });

    it('resposta válida: marca respondida e fecha o ticket; falha ao fechar não desfaz a resposta', async () => {
        const { flow, repo, closer } = make([opt(5, 'Sim'), opt(6, 'Não')]);
        vi.mocked(repo.latestPending).mockResolvedValue({ id: 9, research_id: 1, ticket_id: 50 } as never);
        closer.finalizeAfterResearch.mockRejectedValueOnce(new Error('db'));
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(await flow.tryRecordAnswer('c1', 7, '2')).toBe(true);
        expect(repo.markAnswered).toHaveBeenCalledWith(9, 6);
        expect(closer.finalizeAfterResearch).toHaveBeenCalledWith(50, 'c1');
        log.mockRestore();
    });

    it('fila nula não consulta o banco', async () => {
        const { flow } = make([]);
        expect(await flow.findActiveForQueue(null, 'c1')).toBeNull();
    });
});
