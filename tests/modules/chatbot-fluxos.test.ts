import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { atendimento_messages, contacts, queues, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { bots, bot_nodes, bot_conversations, bot_rotate_log, type NewBot } from '../../src/modules/bots/bots.db.schema';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';
import { ticketService } from '../../src/modules/atendimento/ticket.service';
import { chatbotExecutorService } from '../../src/modules/bots/chatbot-executor.service';
import { mediaStorage } from '../../src/config/media-storage';

/**
 * Motor dos fluxos (chatbot-executor): o que o contato recebe em cada tipo de
 * nó e como a conversa anda. Os envios ao WhatsApp são interceptados.
 */

const SUFFIX = Date.now();
let seq = 0;
type Sent = { kind: string; to: string; payload: unknown };
let sent: Sent[] = [];

beforeAll(() => {
    vi.spyOn(whatsappService, 'sendTextToPhone').mockImplementation(async (_c, to, text) => { sent.push({ kind: 'text', to, payload: text }); });
    vi.spyOn(whatsappService, 'sendMediaToPhone').mockImplementation(async (_c, to, media, caption) => { sent.push({ kind: 'media', to, payload: { ...media, caption } }); });
    vi.spyOn(whatsappService, 'sendPollToPhone').mockImplementation(async (_c, to, question, options) => { sent.push({ kind: 'poll', to, payload: { question, options } }); });
    vi.spyOn(whatsappService, 'sendContactCardToPhone').mockImplementation(async (_c, to, name, phone) => { sent.push({ kind: 'card', to, payload: { name, phone } }); });
});
beforeEach(() => { sent = []; });
afterEach(() => { vi.useRealTimers(); });

const texts = () => sent.filter((s) => s.kind === 'text').map((s) => s.payload);

type NodeDef = { id: string; type: string; message?: string; next?: string; data?: object; queue_id?: number };

/** Cria empresa + bot padrão ativo com os nós dados (sem atraso entre mensagens). */
async function flow(nodes: NodeDef[], botOver: Partial<NewBot> = {}) {
    const tag = `${SUFFIX}-${++seq}`;
    const [co] = await db.insert(companies).values({ name: `Empresa Fluxo ${tag}`, status: true }).returning({ id: companies.id });
    const [bot] = await db.insert(bots).values({ company_id: co.id, name: 'Fluxo', active: true, default_bot: true, ...botOver }).returning();
    if (nodes.length) {
        await db.insert(bot_nodes).values(nodes.map((n, i) => ({
            id: `${n.id}-${tag}`, bot_id: bot.id, company_id: co.id, type: n.type, label: n.id, message: n.message ?? '',
            order_index: i, delay_seconds: 0, next_node_id: n.next ? `${n.next}-${tag}` : null,
            node_data: n.data ? JSON.stringify(n.data, (k, v) => (typeof v === 'string' && k.endsWith('node_id') ? `${v}-${tag}` : v)) : null,
            queue_id: n.queue_id ?? null,
        })));
    }
    const phone = `5511${String(SUFFIX).slice(-6)}${String(seq).padStart(3, '0')}`;
    const say = (message: string, extra: { ticketId?: number; contactId?: number } = {}) =>
        chatbotExecutorService.execute(co.id, 1, phone, message, extra.ticketId, extra.contactId, 'Ana');
    const conversation = async () => (await db.select().from(bot_conversations)
        .where(and(eq(bot_conversations.company_id, co.id), eq(bot_conversations.contact_phone, phone))))
        .sort((a, b) => b.id - a.id)[0];
    const nodeId = (id: string) => `${id}-${tag}`;
    return { companyId: co.id, botId: bot.id, phone, say, conversation, nodeId };
}

const menu = (next1: string, next2: string) => ({
    id: 'menu', type: 'menu', message: 'Escolha:',
    data: { options: [{ number: 1, label: 'Suporte', next_node_id: next1 }, { number: 2, label: 'Financeiro', next_node_id: next2 }] },
});

describe('Início e menu', () => {
    it('início → mensagem → menu: envia na ordem e espera a escolha', async () => {
        const f = await flow([
            { id: 'start', type: 'start', message: 'Olá, {{nome}}!', next: 'msg' },
            { id: 'msg', type: 'message', message: 'Seu número: {telefone}', next: 'menu' },
            menu('sup', 'fin'),
            { id: 'sup', type: 'message', message: 'Suporte aqui' },
            { id: 'fin', type: 'message', message: 'Financeiro aqui' },
        ]);
        await f.say('oi');
        expect(texts()).toEqual(['Olá, Ana!', `Seu número: ${f.phone}`, 'Escolha:\n\n1. Suporte\n2. Financeiro']);
        expect(await f.conversation()).toMatchObject({ status: 'active', current_node_id: f.nodeId('menu') });
    });

    it('a escolha vale por número, pelo nome (sem caixa) ou pelo começo do nome', async () => {
        for (const [answer, expected] of [['2', 'Financeiro aqui'], ['suporte', 'Suporte aqui'], ['fin', 'Financeiro aqui']]) {
            const f = await flow([{ id: 'start', type: 'start', message: 'Oi', next: 'menu' }, menu('sup', 'fin'),
                { id: 'sup', type: 'message', message: 'Suporte aqui' }, { id: 'fin', type: 'message', message: 'Financeiro aqui' }]);
            await f.say('oi');
            sent = [];
            await f.say(answer);
            expect(texts(), answer).toEqual([expected]);
        }
    });

    it('opção que não existe: nada é enviado e a conversa continua no menu', async () => {
        const f = await flow([{ id: 'start', type: 'start', message: 'Oi', next: 'menu' }, menu('sup', 'fin'),
            { id: 'sup', type: 'message', message: 'S' }, { id: 'fin', type: 'message', message: 'F' }]);
        await f.say('oi');
        sent = [];
        await f.say('9');
        expect(sent).toEqual([]);
        expect((await f.conversation()).current_node_id).toBe(f.nodeId('menu'));
    });

    it('enquete com 2+ opções vai como enquete; o voto pelo nome segue o fluxo', async () => {
        const f = await flow([
            { id: 'start', type: 'start', message: 'Oi', next: 'poll' },
            { id: 'poll', type: 'poll', message: 'Qual?', data: { options: [{ number: 1, label: 'Sim', next_node_id: 'yes' }, { number: 2, label: 'Não', next_node_id: 'no' }] } },
            { id: 'yes', type: 'message', message: 'Ótimo' }, { id: 'no', type: 'message', message: 'Pena' },
        ]);
        await f.say('oi');
        expect(sent.find((s) => s.kind === 'poll')?.payload).toEqual({ question: 'Qual?', options: ['Sim', 'Não'] });
        sent = [];
        await f.say('Não');
        expect(texts()).toEqual(['Pena']);
    });

    it('gatilho por palavra-chave: só começa se a mensagem tiver uma delas', async () => {
        const f = await flow([{ id: 'start', type: 'start', message: 'Promoção!', data: { trigger: 'keywords', trigger_keywords: 'promo, oferta' } }]);
        await f.say('bom dia');
        expect(sent).toEqual([]);
        expect(await f.conversation()).toBeUndefined();
        await f.say('quero a OFERTA');
        expect(texts()).toEqual(['Promoção!']);
    });

    it('grupos nunca recebem resposta do bot', async () => {
        const f = await flow([{ id: 'start', type: 'start', message: 'Oi' }]);
        await chatbotExecutorService.execute(f.companyId, 1, '123-456@g.us', 'oi');
        expect(sent).toEqual([]);
    });
});

describe('Captura de dado e condição', () => {
    it('dado inválido: avisa e espera de novo; válido: guarda e usa adiante', async () => {
        const f = await flow([
            { id: 'start', type: 'start', message: 'Seu e-mail?', next: 'cap' },
            { id: 'cap', type: 'capture', message: '', next: 'thanks', data: { variable_name: 'email', data_type: 'email', error_message: 'E-mail inválido' } },
            { id: 'thanks', type: 'message', message: 'Anotado: {{email}}' },
        ]);
        await f.say('oi');
        sent = [];
        await f.say('nao-sei');
        expect(texts()).toEqual(['E-mail inválido']);
        expect((await f.conversation()).current_node_id).toBe(f.nodeId('cap'));
        sent = [];
        await f.say('ana@loja.com');
        expect(texts()).toEqual(['Anotado: ana@loja.com']);
    });

    it('condição escolhe o caminho pelo valor capturado', async () => {
        const make = () => flow([
            { id: 'start', type: 'start', message: 'Idade?', next: 'q' },
            { id: 'q', type: 'question', next: 'cond', data: { variable_name: 'idade' } },
            { id: 'cond', type: 'condition', data: { cond_variable: 'idade', cond_operator: 'maior', cond_value: '17', true_node_id: 'adult', false_node_id: 'minor' } },
            { id: 'adult', type: 'message', message: 'Maior' }, { id: 'minor', type: 'message', message: 'Menor' },
        ]);
        for (const [age, expected] of [['30', 'Maior'], ['12', 'Menor']]) {
            const f = await make();
            await f.say('oi');
            sent = [];
            await f.say(age);
            expect(texts()).toEqual([expected]);
        }
    });
});

describe('Fim, expiração e horário', () => {
    it('fim: envia a mensagem e a de saída; a próxima mensagem começa de novo', async () => {
        const f = await flow([{ id: 'start', type: 'start', message: 'Oi', next: 'end' }, { id: 'end', type: 'end', message: 'Tchau' }],
            { send_exit_message: true, exit_message: 'Volte sempre' });
        await f.say('oi');
        expect(texts()).toEqual(['Oi', 'Tchau', 'Volte sempre']);
        expect((await f.conversation()).status).toBe('ended');
        sent = [];
        await f.say('oi de novo');
        expect(texts()).toEqual(['Oi', 'Tchau', 'Volte sempre']);
    });

    it('conversa parada além do tempo de resposta recomeça do início', async () => {
        const f = await flow([{ id: 'start', type: 'start', message: 'Oi', next: 'menu' }, menu('a', 'b'),
            { id: 'a', type: 'message', message: 'A' }, { id: 'b', type: 'message', message: 'B' }], { response_timer: 3 });
        await f.say('oi');
        const conv = await f.conversation();
        await db.update(bot_conversations).set({ updated_at: new Date(Date.now() - 10 * 60_000) }).where(eq(bot_conversations.id, conv.id));
        sent = [];
        await f.say('1');
        expect(texts()).toEqual(['Oi', 'Escolha:\n\n1. Suporte\n2. Financeiro']);
        expect((await db.select().from(bot_conversations).where(eq(bot_conversations.id, conv.id)))[0].status).toBe('ended');
    });

    it('fora do horário: só a mensagem de fora do horário, sem abrir conversa', async () => {
        const f = await flow([{ id: 'start', type: 'start', message: 'Oi' }], { opening_hours: true, offline_message: 'Estamos fechados', timezone: 'UTC' });
        await f.say('oi');
        expect(texts()).toEqual(['Estamos fechados']);
        expect(await f.conversation()).toBeUndefined();
    });

    it('dentro do horário: o fluxo roda normalmente', async () => {
        const all = { mon_ini: '00:00', mon_fin: '23:59', tue_ini: '00:00', tue_fin: '23:59', wed_ini: '00:00', wed_fin: '23:59',
            thu_ini: '00:00', thu_fin: '23:59', fri_ini: '00:00', fri_fin: '23:59', sat_ini: '00:00', sat_fin: '23:59', sun_ini: '00:00', sun_fin: '23:59' };
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2030-01-09T12:00:00Z'));
        const f = await flow([{ id: 'start', type: 'start', message: 'Oi' }], { opening_hours: true, offline_message: 'Fechado', timezone: 'UTC', ...all });
        await f.say('oi');
        expect(texts()).toEqual(['Oi']);
    });
});

describe('Ações', () => {
    it('transferir: envia a mensagem e manda o ticket para a fila', async () => {
        const route = vi.spyOn(ticketService, 'routeToQueue').mockResolvedValue(null);
        const f0 = await flow([]);
        const [q] = await db.insert(queues).values({ company_id: f0.companyId, name: 'Fila' }).returning({ id: queues.id });
        await db.delete(bots).where(eq(bots.company_id, f0.companyId));
        const f = { ...f0 };
        const [bot] = await db.insert(bots).values({ company_id: f.companyId, name: 'T', active: true, default_bot: true }).returning();
        await db.insert(bot_nodes).values([
            { id: `ts-${SUFFIX}`, bot_id: bot.id, company_id: f.companyId, type: 'start', label: 's', message: 'Oi', delay_seconds: 0, next_node_id: `tt-${SUFFIX}` },
            { id: `tt-${SUFFIX}`, bot_id: bot.id, company_id: f.companyId, type: 'transfer', label: 't', message: '', delay_seconds: 0, queue_id: q.id, node_data: JSON.stringify({ transfer_message: 'Vou te transferir' }) },
        ]);
        const [ct] = await db.insert(contacts).values({ company_id: f.companyId, name: 'Ana' }).returning({ id: contacts.id });
        const [t] = await db.insert(tickets).values({ company_id: f.companyId, contact_id: ct.id, status_id: 9 }).returning({ id: tickets.id });

        await chatbotExecutorService.execute(f.companyId, 1, f.phone, 'oi', t.id, ct.id, 'Ana');
        expect(texts()).toEqual(['Oi', 'Vou te transferir']);
        expect(route).toHaveBeenCalledWith(t.id, f.companyId, q.id);
        route.mockRestore();
    });

    it('rodízio: cada lead vai para o próximo contato da lista e o escolhido é avisado', async () => {
        const f = await flow([
            { id: 'start', type: 'start', message: 'Oi', next: 'rot' },
            { id: 'rot', type: 'rotate', data: { rotate_contacts: [{ name: 'Bia', phone: '5511900000001' }, { name: 'Caio', phone: '5511900000002' }], rotate_notify: 'Novo lead: {{nome}}' } },
        ]);
        await f.say('oi');
        expect(sent).toContainEqual({ kind: 'text', to: '5511900000001', payload: 'Novo lead: Ana' });
        await chatbotExecutorService.execute(f.companyId, 1, '5511988887777', 'oi', undefined, undefined, 'Davi');
        expect(sent).toContainEqual({ kind: 'text', to: '5511900000002', payload: 'Novo lead: Davi' });
        const log = await db.select().from(bot_rotate_log).where(eq(bot_rotate_log.company_id, f.companyId));
        expect(log.map((l) => l.contact_name)).toEqual(['Bia', 'Caio']);
    });

    it('PIX: envia o QR como imagem e o copia-e-cola em seguida', async () => {
        const f = await flow([
            { id: 'start', type: 'start', message: 'Oi', next: 'pix' },
            { id: 'pix', type: 'pix', message: 'Pague aqui', data: { pix_key: 'loja@pix.com', pix_name: 'Loja', pix_city: 'SP', pix_amount: '10.50' } },
        ]);
        await f.say('oi');
        const media = sent.find((s) => s.kind === 'media')!.payload as { mimetype: string; caption: string; path: string };
        expect(media).toMatchObject({ mimetype: 'image/png', caption: 'Pague aqui' });
        expect(media.path).toContain('bots/pix/');
        expect(String(texts().at(-1))).toMatch(/^000201/);
        // em teste o storage é o disco: apaga o QR gravado para não deixar arquivo para trás
        await mediaStorage.delete(new URL(media.path, 'http://local').pathname);
    });

    it('cartão de contato: envia o texto e o contato', async () => {
        const f = await flow([{ id: 'start', type: 'start', message: 'Oi', next: 'card' },
            { id: 'card', type: 'contact_card', message: 'Fale com:', data: { contact_name: 'Gerente', contact_phone: '5511977776666' } }]);
        await f.say('oi');
        expect(sent.at(-1)).toEqual({ kind: 'card', to: f.phone, payload: { name: 'Gerente', phone: '5511977776666' } });
    });

    it('falha no meio do fluxo marca a conversa como erro, com o motivo', async () => {
        const f = await flow([{ id: 'start', type: 'start', message: 'Oi', next: 'm' },
            { id: 'm', type: 'media', data: { media_url: '/uploads/x.png', media_mimetype: 'image/png' } }]);
        vi.mocked(whatsappService.sendMediaToPhone).mockRejectedValueOnce(new Error('conexão caiu'));
        await f.say('oi');
        expect(await f.conversation()).toMatchObject({ status: 'error', error_message: 'conexão caiu' });
    });
});

describe('Correções da refatoração', () => {
    it('horário que atravessa a meia-noite (22:00–02:00) vale às 23:30 (antes: sempre fechado)', async () => {
        const night = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].flatMap((d) => [[`${d}_ini`, '22:00'], [`${d}_fin`, '02:00']]));
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2030-01-09T23:30:00Z'));
        const f = await flow([{ id: 'start', type: 'start', message: 'Plantão' }], { opening_hours: true, offline_message: 'Fechado', timezone: 'UTC', ...night });
        await f.say('oi');
        expect(texts()).toEqual(['Plantão']);
    });

    it('toda mensagem do bot entra no histórico do atendimento (antes: fora do horário e erro de captura ficavam de fora)', async () => {
        const f = await flow([{ id: 'start', type: 'start', message: 'Oi' }], { opening_hours: true, offline_message: 'Estamos fechados', timezone: 'UTC' });
        const [ct] = await db.insert(contacts).values({ company_id: f.companyId, name: 'Ana' }).returning({ id: contacts.id });
        const [t] = await db.insert(tickets).values({ company_id: f.companyId, contact_id: ct.id, status_id: 9 }).returning({ id: tickets.id });
        await f.say('oi', { ticketId: t.id, contactId: ct.id });
        const saved = await db.select().from(atendimento_messages).where(eq(atendimento_messages.ticket_id, t.id));
        expect(saved.map((m) => m.body)).toEqual(['Estamos fechados']);
    });
});
