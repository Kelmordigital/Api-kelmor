import { describe, it, expect, vi } from 'vitest';
import {
    WorkingHours, chooseOption, evaluateCondition, interpolate, isValidCapture, startTriggerMatches,
} from '../../src/modules/bots/flow/flow-rules';
import { FlowEngine } from '../../src/modules/bots/flow/flow-engine';
import type { NodeHandler } from '../../src/modules/bots/flow/node-handlers';
import type { Bot, BotConversation, BotNode } from '../../src/modules/bots/bots.db.schema';

const bot = (over: Partial<Bot> = {}) => ({ id: 1, opening_hours: false, timezone: 'UTC', response_timer: 3, ...over }) as Bot;
const node = (id: string, type: string, over: Partial<BotNode> = {}) => ({ id, type, next_node_id: null, node_data: null, ...over }) as BotNode;

describe('Regras do fluxo', () => {
    it('variáveis {{x}} e {x}; desconhecida vira vazio', () => {
        expect(interpolate('Oi {{nome}}, tel {telefone}{{x}}', { nome: 'Ana', telefone: '11' })).toBe('Oi Ana, tel 11');
    });

    it('menu: número, nome sem caixa, começo do nome; vazio ou inexistente → nada', () => {
        const options = [{ number: 1, label: 'Suporte', next_node_id: 's' }, { number: 2, label: 'Financeiro', next_node_id: 'f' }];
        expect(chooseOption(options, '2')).toBe('f');
        expect(chooseOption(options, ' SUPORTE ')).toBe('s');
        expect(chooseOption(options, 'fin')).toBe('f');
        expect(chooseOption(options, '')).toBeNull();
        expect(chooseOption(options, '9')).toBeNull();
    });

    it('captura valida e-mail, telefone, CPF, número e nome', () => {
        expect(isValidCapture('a@b.co', 'email')).toBe(true);
        expect(isValidCapture('a@b', 'email')).toBe(false);
        expect(isValidCapture('(11) 98888-7777', 'telefone')).toBe(true);
        expect(isValidCapture('123.456.789-0', 'cpf')).toBe(false);
        expect(isValidCapture('10,5', 'numero')).toBe(true);
        expect(isValidCapture('7', 'nome')).toBe(false);
        expect(isValidCapture('   ', 'texto')).toBe(false);
    });

    it('condições comparam sem diferenciar maiúsculas; maior/menor aceitam vírgula', () => {
        const ctx = { cidade: 'São Paulo', valor: '10,5' };
        expect(evaluateCondition({ cond_variable: 'cidade', cond_operator: 'igual', cond_value: 'são paulo' }, ctx)).toBe(true);
        expect(evaluateCondition({ cond_variable: 'cidade', cond_operator: 'contem', cond_value: 'paulo' }, ctx)).toBe(true);
        expect(evaluateCondition({ cond_variable: 'valor', cond_operator: 'maior', cond_value: '10' }, ctx)).toBe(true);
        expect(evaluateCondition({ cond_variable: 'nada', cond_operator: 'existe' }, ctx)).toBe(false);
    });

    it('gatilho por palavras-chave', () => {
        const start = node('s', 'start', { node_data: JSON.stringify({ trigger: 'keywords', trigger_keywords: 'promo, oferta' }) });
        expect(startTriggerMatches(start, 'Tem OFERTA?')).toBe(true);
        expect(startTriggerMatches(start, 'bom dia')).toBe(false);
        expect(startTriggerMatches(node('s', 'start'), 'qualquer')).toBe(true);
    });
});

describe('Horário de funcionamento', () => {
    const at = (iso: string) => new Date(iso); // 2030-01-09 é quarta-feira
    it('sem horário configurado: sempre aberto; dia sem início/fim: fechado', () => {
        expect(WorkingHours.isOpen(bot(), at('2030-01-09T03:00:00Z'))).toBe(true);
        expect(WorkingHours.isOpen(bot({ opening_hours: true, wed_ini: '08:00' }), at('2030-01-09T09:00:00Z'))).toBe(false);
    });

    it('horário normal: início incluso, fim não', () => {
        const b = bot({ opening_hours: true, wed_ini: '08:00', wed_fin: '18:00' });
        expect(WorkingHours.isOpen(b, at('2030-01-09T08:00:00Z'))).toBe(true);
        expect(WorkingHours.isOpen(b, at('2030-01-09T18:00:00Z'))).toBe(false);
    });

    it('atravessa a meia-noite: vale até o fim no dia seguinte', () => {
        const b = bot({ opening_hours: true, wed_ini: '22:00', wed_fin: '02:00' });
        expect(WorkingHours.isOpen(b, at('2030-01-09T23:30:00Z'))).toBe(true);  // quarta 23:30
        expect(WorkingHours.isOpen(b, at('2030-01-10T01:30:00Z'))).toBe(true);  // quinta 01:30, turno de quarta
        expect(WorkingHours.isOpen(b, at('2030-01-10T02:30:00Z'))).toBe(false);
        expect(WorkingHours.isOpen(b, at('2030-01-09T01:30:00Z'))).toBe(false); // quarta 01:30: terça não tem turno
    });

    it('usa o fuso do bot', () => {
        const b = bot({ opening_hours: true, timezone: 'America/Sao_Paulo', wed_ini: '08:00', wed_fin: '18:00' });
        expect(WorkingHours.isOpen(b, at('2030-01-09T10:30:00Z'))).toBe(false); // 07:30 em SP
        expect(WorkingHours.isOpen(b, at('2030-01-09T11:30:00Z'))).toBe(true);  // 08:30 em SP
    });
});

describe('FlowEngine', () => {
    function engine(nodes: BotNode[], handlers: Map<string, NodeHandler>, conversation?: Partial<BotConversation>) {
        const conversations = {
            findActiveConversation: vi.fn(async () => conversation as BotConversation | undefined),
            createConversation: vi.fn(async () => ({ id: 7 }) as BotConversation),
            updateConversation: vi.fn(async () => {}),
        };
        const messenger = { text: vi.fn(async () => {}), media: vi.fn(), poll: vi.fn(), contactCard: vi.fn(), notify: vi.fn() };
        const e = new FlowEngine(
            { findDefaultActive: async () => bot(), getNodes: async () => nodes },
            conversations, { isActive: async () => true }, async () => true, messenger, handlers,
            () => new Date('2030-01-09T12:00:00Z'),
        );
        const receive = (message: string) => e.receive({ companyId: 'c', connectionId: 1, phone: '5511', message });
        return { receive, conversations, messenger };
    }

    it('tipo de nó novo funciona só registrando um handler (sem mexer no motor)', async () => {
        const custom: NodeHandler = { run: vi.fn(async () => ({ next: null })) };
        const { receive } = engine([node('s', 'start', { next_node_id: 'x' }), node('x', 'meu_tipo')],
            new Map([['start', { run: async (n) => ({ next: n.next_node_id }) }], ['meu_tipo', custom]]));
        await receive('oi');
        expect(custom.run).toHaveBeenCalled();
    });

    it('fluxo em loop para depois de 50 passos', async () => {
        const run = vi.fn(async (n: BotNode) => ({ next: n.id }));
        const { receive, conversations } = engine([node('s', 'start')], new Map([['start', { run }]]));
        await receive('oi');
        expect(run).toHaveBeenCalledTimes(50);
        expect(conversations.updateConversation).toHaveBeenCalledWith(7, expect.objectContaining({ current_node_id: 's' }));
    });

    it('nó que quebra marca a conversa com erro', async () => {
        const { receive, conversations } = engine([node('s', 'start')], new Map([['start', { run: async () => { throw new Error('caiu'); } }]]));
        await receive('oi');
        expect(conversations.updateConversation).toHaveBeenCalledWith(7, { status: 'error', error_message: 'caiu' });
    });

    it('mensagem vazia e grupos são ignorados', async () => {
        const { receive, conversations } = engine([node('s', 'start')], new Map());
        await receive('   ');
        expect(conversations.findActiveConversation).not.toHaveBeenCalled();
    });

    it('resposta num nó que espera: segue para o próximo; `stay` só guarda as variáveis', async () => {
        const wait: NodeHandler = { run: async () => ({ next: null, stop: 'wait' }), reply: async (_n, _d, msg) => (msg === 'ok' ? { next: 'b' } : { next: null, stay: true }) };
        const after: NodeHandler = { run: vi.fn(async () => ({ next: null })) };
        const conv = { id: 3, current_node_id: 'a', updated_at: new Date('2030-01-09T11:59:00Z'), context: '{}' };
        const nodes = [node('a', 'q'), node('b', 'next')];

        const stay = engine(nodes, new Map([['q', wait], ['next', after]]), conv);
        await stay.receive('não');
        expect(after.run).not.toHaveBeenCalled();
        expect(stay.conversations.updateConversation).toHaveBeenCalledWith(3, { context: expect.any(String) });

        const go = engine(nodes, new Map([['q', wait], ['next', after]]), conv);
        await go.receive('ok');
        expect(after.run).toHaveBeenCalled();
    });
});
