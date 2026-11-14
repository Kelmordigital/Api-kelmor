import { describe, it, expect, vi } from 'vitest';
import { BotService, BotStats } from '../../src/modules/bots/bots.service';
import type { BotRepository } from '../../src/modules/bots/bots.repository';
import type { Bot, BotConversation } from '../../src/modules/bots/bots.db.schema';
import { createBotSchema, updateBotSchema } from '../../src/modules/bots/bots.dto';
import { SchemaValidator } from '../../src/core/validation/schema-validator';
import { BadRequestError, NotFoundError } from '../../src/core/errors/http-errors';

const bot = (over: Partial<Bot> = {}) => ({ id: 1, name: 'Bot', active: false, trigger_type: 'welcome', ...over }) as Bot;
const node = (id: string, over: object = {}) => ({
    id, type: 'message', label: 'Nó', message: 'Oi', order_index: 0, next_node_id: null,
    delay_seconds: 2, x: 0, y: 0, node_data: null, queue_id: null, ...over,
});

function make(over: Partial<BotRepository> = {}) {
    const repo = {
        findById: vi.fn(async (id: number) => bot({ id })),
        ownsConnection: vi.fn(async () => true),
        ownedQueueIds: vi.fn(async (_c: string, ids: number[]) => ids.filter((id) => id < 100)),
        replaceNodes: vi.fn(async () => {}),
        create: vi.fn(async (data) => ({ id: 9, ...data })),
        update: vi.fn(async (id, _c, data) => bot({ id, ...data })),
        ...over,
    } as unknown as BotRepository;
    return { repo, service: new BotService(repo) };
}

describe('Validação do bot', () => {
    it('campos fora do contrato são descartados (não troca empresa nem exclui)', () => {
        const input = SchemaValidator.parse(updateBotSchema, { name: 'Novo', company_id: 'outra', deleted_at: '2030-01-01', id: 5 });
        expect(input).toEqual({ name: 'Novo' });
    });

    it('fuso, horário e nome inválidos têm mensagem própria', () => {
        expect(() => SchemaValidator.parse(updateBotSchema, { timezone: 'Marte/Olympus' })).toThrow('Fuso horário inválido');
        expect(() => SchemaValidator.parse(updateBotSchema, { fri_fin: '7h' })).toThrow('Horário deve estar no formato HH:MM');
        expect(() => SchemaValidator.parse(createBotSchema, { name: '   ' })).toThrow('name é obrigatório');
        expect(SchemaValidator.parse(updateBotSchema, { mon_ini: '', mon_fin: '18:30', timezone: 'America/Manaus' }))
            .toEqual({ mon_ini: null, mon_fin: '18:30', timezone: 'America/Manaus' });
    });
});

describe('BotService', () => {
    it('bot de outra empresa → 404', async () => {
        await expect(make({ findById: vi.fn(async () => null) }).service.toggleActive(1, 'c')).rejects.toEqual(new NotFoundError('Bot não encontrado'));
    });

    it('conexão de outra empresa → 400, sem gravar', async () => {
        const { service, repo } = make({ ownsConnection: vi.fn(async () => false) });
        await expect(service.create('c', { name: 'X', connection_id: 7 })).rejects.toEqual(new BadRequestError('Conexão não encontrada'));
        expect(repo.create).not.toHaveBeenCalled();
    });

    it('salvar o fluxo: ids repetidos ou fila de outra empresa → 400 sem tocar nos nós', async () => {
        const dup = make();
        await expect(dup.service.syncNodes(1, 'c', [node('a'), node('a')])).rejects.toBeInstanceOf(BadRequestError);
        expect(dup.repo.replaceNodes).not.toHaveBeenCalled();

        const foreign = make();
        await expect(foreign.service.syncNodes(1, 'c', [node('a', { queue_id: 5 }), node('b', { label: 'Vendas', queue_id: 500 })]))
            .rejects.toEqual(new BadRequestError('Fila do nó "Vendas" não encontrada'));
        expect(foreign.repo.replaceNodes).not.toHaveBeenCalled();
    });

    it('salvar o fluxo grava node_data como JSON e mapeia id já usado por outro fluxo para 400', async () => {
        const ok = make();
        await ok.service.syncNodes(1, 'c', [node('a', { node_data: { link: 'x' } })]);
        expect(ok.repo.replaceNodes).toHaveBeenCalledWith(1, 'c', [expect.objectContaining({ id: 'a', node_data: '{"link":"x"}', company_id: 'c' })]);

        const clash = make({ replaceNodes: vi.fn(async () => { throw Object.assign(new Error('dup'), { code: '23505' }); }) });
        await expect(clash.service.syncNodes(1, 'c', [node('a')])).rejects.toBeInstanceOf(BadRequestError);
    });

    it('node_data corrompido no banco volta como null, sem derrubar a tela', async () => {
        const { service } = make({ getNodes: vi.fn(async () => [{ id: 'a', node_data: '{quebrado' }]) } as Partial<BotRepository>);
        expect(await service.getNodes(1, 'c')).toEqual([{ id: 'a', node_data: null }]);
    });
});

describe('BotStats', () => {
    const now = new Date('2030-03-15T15:00:00-03:00'); // sexta, 15:00 em Brasília
    const conv = (startedAt: string, status = 'ended', botId = 1) =>
        ({ bot_id: botId, started_at: new Date(startedAt), status, error_message: null }) as BotConversation;

    it('7 dias de série, contagem de hoje e de erros, execuções recentes com nome do fluxo', () => {
        const stats = BotStats.build(
            [bot({ id: 1, name: 'Recepção', active: true }), bot({ id: 2, trigger_type: 'keyword' })],
            [conv('2030-03-15T10:00:00-03:00', 'error'), conv('2030-03-14T10:00:00-03:00'), conv('2030-03-14T11:00:00-03:00', 'active', 99)],
            1, now,
        );
        expect(stats).toMatchObject({ active_bots: 1, total_bots: 2, today_count: 1, error_count: 1, in_progress_count: 1, last_7_days_count: 3 });
        expect(stats.by_trigger).toEqual({ welcome: 1, keyword: 1 });
        expect(stats.executions_by_day).toHaveLength(7);
        expect(stats.executions_by_day.reduce((n, d) => n + d.count, 0)).toBe(3);
        expect(stats.recent_executions.map((e) => e.bot_name)).toEqual(['Recepção', 'Recepção', 'Fluxo removido']);
    });

    it('dias no horário de Brasília: conversa às 22:30 conta no dia, não no seguinte', () => {
        const noite = new Date('2030-03-16T01:30:00Z'); // sexta 15/03, 22:30 em Brasília
        const stats = BotStats.build([bot({ id: 1 })], [conv('2030-03-16T01:00:00Z')], 0, noite); // 22:00 de sexta
        expect(stats.today_count).toBe(1);
        expect(stats.executions_by_day.at(-1)).toMatchObject({ date: '2030-03-15', label: 'Sex', count: 1 });
        expect(stats.executions_by_day[0]).toMatchObject({ date: '2030-03-09', label: 'Sáb' });
        expect(BotStats.windowStart(noite).toISOString()).toBe('2030-03-09T03:00:00.000Z');
    });
});
