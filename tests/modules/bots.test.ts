import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { queues } from '../../src/modules/atendimento/atendimento.db.schema';
import { bots, bot_conversations, bot_rotate_log } from '../../src/modules/bots/bots.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/** Bots (Automações): CRUD do fluxo, nós, estatísticas e relatório de rodízio. */

const SUFFIX = Date.now();
const app = buildApp();
let companyId: string;
let otherCompanyId: string;
let otherBotId: number;
let queueId: number;
let otherQueueId: number;
let adminToken: string;
let userToken: string;

async function login(email: string) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha123' } });
    return JSON.parse(res.body).access_token as string;
}

function call(token: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url = '', payload?: object) {
    return app.inject({ method, url: `/api/v1/bots${url}`, headers: { authorization: `Bearer ${token}` }, payload });
}

const body = (res: { body: string }) => JSON.parse(res.body);
const node = (id: string, over: object = {}) => ({
    id, type: 'message', label: 'Mensagem', message: 'Olá', order_index: 0, next_node_id: null,
    delay_seconds: 2, x: 10, y: 20, node_data: null, queue_id: null, ...over,
});

beforeAll(async () => {
    await app.ready();
    await runSeed();
    const tags = await db.select({ id: profiles.id, tag: profiles.tag }).from(profiles);
    const profileId = (tag: string) => tags.find((p) => p.tag === tag)!.id;

    const [co] = await db.insert(companies).values({ name: `Empresa Bots ${SUFFIX}`, status: true }).returning({ id: companies.id });
    companyId = co.id;
    const [other] = await db.insert(companies).values({ name: `Empresa Bots Outra ${SUFFIX}`, status: true }).returning({ id: companies.id });
    otherCompanyId = other.id;

    const person = (name: string, tag: string) => ({
        name, email: `bots-${name}-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
        profile_id: profileId(tag), company_id: companyId, email_verified: true, is_approved: true,
    });
    await db.insert(users).values([person('admin', 'admin'), person('atendente', 'user')]);

    const [q] = await db.insert(queues).values({ company_id: companyId, name: 'Fila Bot' }).returning({ id: queues.id });
    queueId = q.id;
    const [oq] = await db.insert(queues).values({ company_id: otherCompanyId, name: 'Fila Alheia' }).returning({ id: queues.id });
    otherQueueId = oq.id;
    const [ob] = await db.insert(bots).values({ company_id: otherCompanyId, name: 'Bot Alheio' }).returning({ id: bots.id });
    otherBotId = ob.id;

    adminToken = await login(`bots-admin-${SUFFIX}@test.com`);
    userToken = await login(`bots-atendente-${SUFFIX}@test.com`);
});

afterAll(async () => { await app.close(); });

describe('Acesso', () => {
    it('atendente → 403 em qualquer rota', async () => {
        expect((await call(userToken, 'GET', '/')).statusCode).toBe(403);
        expect((await call(userToken, 'POST', '/', { name: 'X' })).statusCode).toBe(403);
    });

    it('bot de outra empresa → 404', async () => {
        for (const [method, url] of [
            ['PUT', `/${otherBotId}`], ['DELETE', `/${otherBotId}`], ['PATCH', `/${otherBotId}/toggle-active`],
            ['PATCH', `/${otherBotId}/set-default`], ['GET', `/${otherBotId}/nodes`], ['POST', `/${otherBotId}/nodes/sync`],
        ] as const) {
            const res = await call(adminToken, method, url, method === 'POST' ? { nodes: [] } : method === 'PUT' ? { name: 'Invasão' } : undefined);
            expect(res.statusCode, `${method} ${url}`).toBe(404);
        }
        const [row] = await db.select().from(bots).where(eq(bots.id, otherBotId));
        expect(row.name).toBe('Bot Alheio');
    });
});

describe('CRUD do bot', () => {
    let botId: number;

    it('cria com os padrões (inativo, não padrão, 3 min, sem horário, fuso de SP)', async () => {
        const res = await call(adminToken, 'POST', '/', { name: 'Atendimento Inicial' });
        expect(res.statusCode).toBe(201);
        expect(body(res)).toMatchObject({
            name: 'Atendimento Inicial', company_id: companyId, active: false, default_bot: false, response_timer: 3,
            opening_hours: false, send_exit_message: false, timezone: 'America/Sao_Paulo', trigger_type: 'welcome',
        });
        botId = body(res).id;
    });

    it('sem nome → 400', async () => {
        const res = await call(adminToken, 'POST', '/', { name: '  ' });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('name é obrigatório');
    });

    it('edita os campos enviados', async () => {
        const res = await call(adminToken, 'PUT', `/${botId}`, {
            name: 'Recepção', response_timer: 10, opening_hours: true, mon_ini: '08:00', mon_fin: '18:00', offline_message: 'Fechado',
        });
        expect(res.statusCode).toBe(200);
        expect(body(res)).toMatchObject({ name: 'Recepção', response_timer: 10, opening_hours: true, mon_ini: '08:00', mon_fin: '18:00', offline_message: 'Fechado' });
    });

    it('liga/desliga e define como padrão (só um padrão por empresa)', async () => {
        expect(body(await call(adminToken, 'PATCH', `/${botId}/toggle-active`)).active).toBe(true);
        expect(body(await call(adminToken, 'PATCH', `/${botId}/toggle-active`)).active).toBe(false);

        const second = body(await call(adminToken, 'POST', '/', { name: 'Segundo' }));
        await call(adminToken, 'PATCH', `/${botId}/set-default`);
        expect(body(await call(adminToken, 'PATCH', `/${second.id}/set-default`)).default_bot).toBe(true);
        const list = body(await call(adminToken, 'GET', '/')) as { id: number; default_bot: boolean }[];
        expect(list.filter((b) => b.default_bot).map((b) => b.id)).toEqual([second.id]);
    });

    it('excluir some da lista; de novo → 404', async () => {
        const temp = body(await call(adminToken, 'POST', '/', { name: 'Temporário' }));
        expect(body(await call(adminToken, 'DELETE', `/${temp.id}`))).toEqual({ ok: true });
        expect((body(await call(adminToken, 'GET', '/')) as { id: number }[]).map((b) => b.id)).not.toContain(temp.id);
        expect((await call(adminToken, 'DELETE', `/${temp.id}`)).statusCode).toBe(404);
    });

    it('nós: sincronizar substitui todos; node_data volta como objeto', async () => {
        const first = await call(adminToken, 'POST', `/${botId}/nodes/sync`, {
            nodes: [node(`a-${SUFFIX}`, { type: 'start', next_node_id: `b-${SUFFIX}` }), node(`b-${SUFFIX}`, { node_data: { options: [{ number: 1, label: 'Sim' }] } })],
        });
        expect(body(first)).toEqual({ ok: true });
        let nodes = body(await call(adminToken, 'GET', `/${botId}/nodes`)) as { id: string; node_data: unknown }[];
        expect(nodes.map((n) => n.id).sort()).toEqual([`a-${SUFFIX}`, `b-${SUFFIX}`]);
        expect(nodes.find((n) => n.id === `b-${SUFFIX}`)!.node_data).toEqual({ options: [{ number: 1, label: 'Sim' }] });

        await call(adminToken, 'POST', `/${botId}/nodes/sync`, { nodes: [node(`c-${SUFFIX}`, { type: 'transfer', queue_id: queueId })] });
        nodes = body(await call(adminToken, 'GET', `/${botId}/nodes`));
        expect(nodes).toEqual([expect.objectContaining({ id: `c-${SUFFIX}`, type: 'transfer', queue_id: queueId, message: 'Olá', delay_seconds: 2 })]);
    });

    it('sincronizar sem lista de nós → 400', async () => {
        const res = await call(adminToken, 'POST', `/${botId}/nodes/sync`, { nodes: 'x' });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('nodes deve ser um array');
    });

    it('estatísticas: contagens, 7 dias de série e execuções recentes', async () => {
        await db.insert(bot_conversations).values([
            { bot_id: botId, company_id: companyId, contact_phone: '5511900000001', status: 'active' },
            { bot_id: botId, company_id: companyId, contact_phone: '5511900000002', status: 'error', error_message: 'falhou' },
        ]);
        const stats = body(await call(adminToken, 'GET', '/stats'));
        expect(stats).toMatchObject({ total_bots: 2, active_bots: 0, in_progress_count: 1, error_count: 1, today_count: 2, last_7_days_count: 2 });
        expect(stats.executions_by_day).toHaveLength(7);
        expect(stats.recent_executions[0]).toMatchObject({ bot_name: 'Recepção' });
        expect(stats.by_trigger).toEqual({ welcome: 2 });
    });

    it('relatório do rodízio: leads por contato, do mais acionado ao menos', async () => {
        const nodeId = `rot-${SUFFIX}`;
        await db.insert(bot_rotate_log).values([
            { company_id: companyId, bot_id: botId, node_id: nodeId, contact_name: 'Ana', contact_phone: '5511911111111' },
            { company_id: companyId, bot_id: botId, node_id: nodeId, contact_name: 'Ana', contact_phone: '5511911111111' },
            { company_id: companyId, bot_id: botId, node_id: nodeId, contact_name: 'Bia', contact_phone: '5511922222222' },
            { company_id: otherCompanyId, bot_id: otherBotId, node_id: nodeId, contact_name: 'Intrusa', contact_phone: '5511933333333' },
        ]);
        const rows = body(await call(adminToken, 'GET', `/${botId}/nodes/${nodeId}/rotate-report`));
        expect(rows.map((r: { contact_name: string; total: number }) => [r.contact_name, r.total])).toEqual([['Ana', 2], ['Bia', 1]]);
    });
});

describe('Correções da refatoração', () => {
    it('criar guarda descrição, gatilho, palavras-chave e conexão (antes: ignorados)', async () => {
        const res = await call(adminToken, 'POST', '/', { name: 'Por palavra', description: 'Promoções', trigger_type: 'keyword', keywords: 'promo,oferta' });
        expect(body(res)).toMatchObject({ description: 'Promoções', trigger_type: 'keyword', keywords: 'promo,oferta' });
    });

    it('editar não troca empresa, id nem exclui por fora (antes: gravava qualquer campo)', async () => {
        const bot = body(await call(adminToken, 'POST', '/', { name: 'Blindado' }));
        await call(adminToken, 'PUT', `/${bot.id}`, { name: 'Blindado 2', company_id: otherCompanyId, deleted_at: new Date().toISOString() });
        const [row] = await db.select().from(bots).where(eq(bots.id, bot.id));
        expect(row).toMatchObject({ name: 'Blindado 2', company_id: companyId, deleted_at: null });
    });

    it('id malformado → 400 "id inválido" (antes: 500)', async () => {
        const res = await call(adminToken, 'PUT', '/abc', { name: 'X' });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('id inválido');
    });

    it('fuso horário e horários inválidos → 400 (antes: o bot parava de responder)', async () => {
        const bot = body(await call(adminToken, 'POST', '/', { name: 'Fuso' }));
        const tz = await call(adminToken, 'PUT', `/${bot.id}`, { timezone: 'Marte/Olympus' });
        expect(tz.statusCode).toBe(400);
        expect(body(tz).error).toBe('Fuso horário inválido');
        const hour = await call(adminToken, 'PUT', `/${bot.id}`, { mon_ini: '25:00' });
        expect(hour.statusCode).toBe(400);
        expect(body(hour).error).toBe('Horário deve estar no formato HH:MM');
    });

    it('nome com mais de 100 caracteres → 400 (antes: 500)', async () => {
        const res = await call(adminToken, 'POST', '/', { name: 'x'.repeat(101) });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('O nome do bot deve ter no máximo 100 caracteres');
    });

    it('sincronizar com erro num nó não apaga o fluxo atual (antes: o bot ficava sem nós)', async () => {
        const bot = body(await call(adminToken, 'POST', '/', { name: 'Seguro' }));
        await call(adminToken, 'POST', `/${bot.id}/nodes/sync`, { nodes: [node(`keep-${SUFFIX}`, { type: 'start' })] });

        const res = await call(adminToken, 'POST', `/${bot.id}/nodes/sync`, { nodes: [node(`ok-${SUFFIX}`), node(`ok-${SUFFIX}`)] });
        expect(res.statusCode).toBe(400);
        const nodes = body(await call(adminToken, 'GET', `/${bot.id}/nodes`)) as { id: string }[];
        expect(nodes.map((n) => n.id)).toEqual([`keep-${SUFFIX}`]);
    });

    it('nó "Transferir" para fila de outra empresa → 400', async () => {
        const bot = body(await call(adminToken, 'POST', '/', { name: 'Transfere' }));
        const res = await call(adminToken, 'POST', `/${bot.id}/nodes/sync`, { nodes: [node(`t-${SUFFIX}`, { type: 'transfer', queue_id: otherQueueId })] });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('Fila do nó "Mensagem" não encontrada');
    });

    it('upload de arquivo que não é mídia/documento (ex.: .html) → 400', async () => {
        const boundary = '----kelmor';
        const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.html"\r\nContent-Type: text/html\r\n\r\n<script>alert(1)</script>\r\n--${boundary}--\r\n`;
        const res = await app.inject({
            method: 'POST', url: '/api/v1/bots/upload', payload,
            headers: { authorization: `Bearer ${adminToken}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
        });
        expect(res.statusCode).toBe(400);
    });
});
