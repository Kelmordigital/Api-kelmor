import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { and, eq, inArray } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';

// A Graph API da Meta é simulada (fetch); o segredo do app começa vazio, como hoje em produção.
vi.mock('../../src/config/env', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../src/config/env')>();
    return { env: { ...original.env, META_GRAPH_API_VERSION: 'v21.0', WAB_APP_SECRET: '', WAB_USER_TOKEN: '', WAB_WEBHOOK_VERIFY_TOKEN: 'verifica-teste' } };
});

import { env } from '../../src/config/env';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { atendimento_messages, connection_errors_log, connections, contacts, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';
import { mediaStorage } from '../../src/config/media-storage';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/** API Oficial do WhatsApp (Cloud API): conexão, templates, envio e webhook da Meta. */

const SUFFIX = Date.now();
const app = buildApp();
const GRAPH = 'https://graph.facebook.com/v21.0';
let companyA: string;
let companyB: string;
let adminA: string;
let userA: string;
let adminB: string;
let superToken: string;
let connA: number;
let connB: number;
let baysConnA: number;
const PNID_A = `9${SUFFIX}1`;
const PNID_B = `9${SUFFIX}2`;
const PNID_C = `9${SUFFIX}3`; // outra conexão da empresa B, alvo do teste de "roubo"
let connC: number;
const WABA_A = `8${SUFFIX}1`;

async function login(email: string, password = 'senha123') {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    return JSON.parse(res.body).access_token as string;
}
function call(token: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) {
    return app.inject({ method, url: `/api/v1/whatsapp-oficial${url}`, headers: { authorization: `Bearer ${token}` }, payload });
}
const body = (res: { body: string }) => JSON.parse(res.body);
const errorText = (res: { body: string }) => body(res).message ?? body(res).error;

type Route = { method: string; match: (url: string) => boolean; reply: (url: string, init?: RequestInit) => unknown; status?: number };
let routes: Route[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
const realFetch = globalThis.fetch;
function graph(method: string, match: (url: string) => boolean, reply: Route['reply'], status = 200) {
    routes.push({ method, match, reply, status });
}
function sentTo(method: string, part: string) {
    return fetchMock.mock.calls.filter(([url, init]) => String(url).includes(part) && ((init as RequestInit | undefined)?.method ?? 'GET') === method);
}

function webhook(payload: object, headers: Record<string, string> = {}) {
    return app.inject({ method: 'POST', url: '/wabcloudapi/webhook', payload, headers });
}
function incoming(pnid: string, msg: Record<string, unknown>, name = 'Cliente Oficial') {
    return {
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ field: 'messages', value: {
            messaging_product: 'whatsapp', metadata: { phone_number_id: pnid },
            contacts: [{ profile: { name }, wa_id: msg.from }], messages: [msg],
        } }] }],
    };
}
function statuses(pnid: string, list: Record<string, unknown>[]) {
    return { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: pnid }, statuses: list } }] }] };
}

beforeAll(async () => {
    await app.ready();
    await runSeed();
    const tags = await db.select({ id: profiles.id, tag: profiles.tag }).from(profiles);
    const profileId = (tag: string) => tags.find((p) => p.tag === tag)!.id;
    const [a, b] = await db.insert(companies).values([
        { name: `Oficial A ${SUFFIX}`, status: true }, { name: `Oficial B ${SUFFIX}`, status: true },
    ]).returning({ id: companies.id });
    companyA = a.id;
    companyB = b.id;
    const person = (name: string, tag: string, companyId: string) => ({
        name, email: `wab-${name}-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
        profile_id: profileId(tag), company_id: companyId, email_verified: true, is_approved: true,
    });
    await db.insert(users).values([person('adminA', 'admin', companyA), person('userA', 'user', companyA), person('adminB', 'admin', companyB)]);
    const [ca, cb, bays, cc] = await db.insert(connections).values([
        { company_id: companyA, name: 'Oficial A', type: 'whatsapp-oficial', status: 'connected', wab_connection: true, wab_business_id: WABA_A, wab_business_phonenumber_id: PNID_A, wab_token: 'tok-a' },
        { company_id: companyB, name: 'Oficial B', type: 'whatsapp-oficial', status: 'connected', wab_connection: true, wab_business_id: `8${SUFFIX}2`, wab_business_phonenumber_id: PNID_B, wab_token: 'tok-b' },
        { company_id: companyA, name: 'Bays A', type: 'whatsapp', status: 'connected' },
        { company_id: companyB, name: 'Oficial C', type: 'whatsapp-oficial', status: 'connected', wab_connection: true, wab_business_id: `8${SUFFIX}3`, wab_business_phonenumber_id: PNID_C, wab_token: 'tok-c' },
    ]).returning({ id: connections.id });
    connC = cc.id;
    connA = ca.id;
    connB = cb.id;
    baysConnA = bays.id;
    adminA = await login(`wab-adminA-${SUFFIX}@test.com`);
    userA = await login(`wab-userA-${SUFFIX}@test.com`);
    adminB = await login(`wab-adminB-${SUFFIX}@test.com`);
    superToken = await login('filipe@kelmor.com', 'kelmor123');
});

beforeEach(() => {
    routes = [];
    fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const route = routes.find((r) => r.method === method && r.match(url));
        const status = route?.status ?? 404;
        const data = route ? route.reply(url, init) : { error: { message: 'rota não simulada' } };
        if (data instanceof Buffer) {
            return new Response(new Uint8Array(data), { status, headers: { 'content-type': 'image/jpeg' } });
        }
        return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.stubGlobal('fetch', realFetch);
    vi.restoreAllMocks();
    (env as { WAB_APP_SECRET: string }).WAB_APP_SECRET = '';
});

afterAll(async () => {
    const companyIds = [companyA, companyB];
    const ticketRows = await db.select({ id: tickets.id }).from(tickets).where(inArray(tickets.company_id, companyIds));
    if (ticketRows.length) await db.delete(atendimento_messages).where(inArray(atendimento_messages.ticket_id, ticketRows.map((t) => t.id)));
    await db.delete(tickets).where(inArray(tickets.company_id, companyIds));
    await db.delete(contacts).where(inArray(contacts.company_id, companyIds));
    const connRows = await db.select({ id: connections.id }).from(connections).where(inArray(connections.company_id, companyIds));
    if (connRows.length) await db.delete(connection_errors_log).where(inArray(connection_errors_log.connection_id, connRows.map((c) => c.id)));
    await db.delete(connections).where(inArray(connections.company_id, companyIds));
    await db.delete(users).where(inArray(users.company_id, companyIds));
    await db.delete(companies).where(inArray(companies.id, companyIds));
    await app.close();
});

describe('Verificação do webhook (handshake da Meta)', () => {
    it('devolve o desafio com o token certo; senão 403', async () => {
        const ok = await app.inject({ method: 'GET', url: '/wabcloudapi/webhook?hub.mode=subscribe&hub.verify_token=verifica-teste&hub.challenge=4321' });
        expect(ok.statusCode).toBe(200);
        expect(ok.body).toBe('4321');
        const bad = await app.inject({ method: 'GET', url: '/wabcloudapi/webhook?hub.mode=subscribe&hub.verify_token=outro&hub.challenge=4321' });
        expect(bad.statusCode).toBe(403);
    });
});

describe('Conexão (credenciais manuais)', () => {
    const phoneInfo = () => graph('GET', (u) => u.includes('fields=display_phone_number'), () => ({ display_phone_number: '+55 11 4000-0001', verified_name: 'Loja Verificada' }));

    it('cria a conexão, registra o número e não devolve o token', async () => {
        const pnid = `7${SUFFIX}1`;
        graph('GET', (u) => u.includes(`${pnid}?fields=platform_type`), () => ({ platform_type: 'ON_PREMISE' }));
        graph('POST', (u) => u.endsWith(`/${pnid}/register`), () => ({ success: true }));
        phoneInfo();
        const res = await call(adminA, 'POST', '/connections', { name: 'Minha Oficial', wabaId: '111', phoneNumberId: pnid, token: 'tok-cliente' });
        expect(res.statusCode).toBe(201);
        const conn = body(res);
        expect(conn).toMatchObject({
            company_id: companyA, name: 'Minha Oficial', type: 'whatsapp-oficial', status: 'connected', wab_connection: true,
            wab_business_id: '111', wab_business_phonenumber_id: pnid, wab_business_number: '+55 11 4000-0001', wab_is_registered: true,
        });
        expect(conn.wab_token).toBeUndefined();
        const [register] = sentTo('POST', `/${pnid}/register`);
        expect(JSON.parse(String((register[1] as RequestInit).body))).toEqual({ messaging_product: 'whatsapp', pin: '123456' });
        expect((register[1] as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer tok-cliente');
        const [saved] = await db.select({ token: connections.wab_token }).from(connections).where(eq(connections.id, conn.id));
        expect(saved.token).toBe('tok-cliente');
    });

    it('número já na Cloud API não é registrado de novo; sem nome, usa o nome verificado', async () => {
        const pnid = `7${SUFFIX}2`;
        graph('GET', (u) => u.includes(`${pnid}?fields=platform_type`), () => ({ platform_type: 'CLOUD_API' }));
        phoneInfo();
        const res = await call(adminA, 'POST', '/connections', { wabaId: '112', phoneNumberId: pnid, token: 'tok' });
        expect(body(res)).toMatchObject({ name: 'Loja Verificada', wab_is_registered: true });
        expect(sentTo('POST', '/register')).toHaveLength(0);
    });

    it('conectar de novo o mesmo número da empresa atualiza a conexão (não duplica)', async () => {
        const pnid = `7${SUFFIX}3`;
        graph('GET', (u) => u.includes(`${pnid}?fields=platform_type`), () => ({ platform_type: 'CLOUD_API' }));
        phoneInfo();
        const first = body(await call(adminA, 'POST', '/connections', { name: 'Primeira', wabaId: '113', phoneNumberId: pnid, token: 't1' }));
        const second = body(await call(adminA, 'POST', '/connections', { name: 'Segunda', wabaId: '113', phoneNumberId: pnid, token: 't2' }));
        expect(second.id).toBe(first.id);
        expect(second.name).toBe('Segunda');
        const rows = await db.select().from(connections).where(eq(connections.wab_business_phonenumber_id, pnid));
        expect(rows).toHaveLength(1);
    });

    it('sem code nem wabaId + phoneNumberId → 400', async () => {
        const res = await call(adminA, 'POST', '/connections', { name: 'X', wabaId: '1' });
        expect(res.statusCode).toBe(400);
        expect(errorText(res)).toBe('Informe o code do Embedded Signup ou wabaId + phoneNumberId');
    });

    it('sem token e sem token do sistema → 422', async () => {
        const res = await call(adminA, 'POST', '/connections', { wabaId: '1', phoneNumberId: `7${SUFFIX}9` });
        expect(res.statusCode).toBe(422);
        expect(errorText(res)).toBe('Sem token da Meta: configure WAB_USER_TOKEN ou envie token');
    });

    it('[correção] atendente não cria conexão', async () => {
        const res = await call(userA, 'POST', '/connections', { wabaId: '1', phoneNumberId: `7${SUFFIX}8`, token: 't' });
        expect(res.statusCode).toBe(403);
    });

    it('[correção] número já conectado em outra empresa → 409, sem tomar a conexão dela', async () => {
        graph('GET', (u) => u.includes(`${PNID_C}?fields=platform_type`), () => ({ platform_type: 'CLOUD_API' }));
        phoneInfo();
        const res = await call(adminA, 'POST', '/connections', { name: 'Roubo', wabaId: '1', phoneNumberId: PNID_C, token: 'tok-ladrao' });
        expect(res.statusCode).toBe(409);
        expect(errorText(res)).toBe('Este número já está conectado em outra empresa');
        const [c] = await db.select().from(connections).where(eq(connections.id, connC));
        expect(c).toMatchObject({ company_id: companyB, name: 'Oficial C', wab_token: 'tok-c' });
    });

    it('[correção] usuário sem empresa (superAdmin) → 403', async () => {
        const res = await call(superToken, 'POST', '/connections', { wabaId: '1', phoneNumberId: '2', token: 't' });
        expect(res.statusCode).toBe(403);
        expect(errorText(res)).toBe('Empresa não encontrada');
    });
});

describe('Templates', () => {
    it('lista os templates da conta (WABA) da conexão', async () => {
        graph('GET', (u) => u.includes(`/${WABA_A}/message_templates?limit=100`), () => ({ data: [{ name: 'boas_vindas', status: 'APPROVED' }] }));
        const res = await call(userA, 'GET', `/templates?connectionId=${connA}`);
        expect(res.statusCode).toBe(200);
        expect(body(res)).toEqual([{ name: 'boas_vindas', status: 'APPROVED' }]);
    });

    it('conexão de outra empresa ou que não é oficial → 404; sem connectionId → 400', async () => {
        expect(errorText(await call(adminA, 'GET', `/templates?connectionId=${connB}`))).toBe('Conexão oficial não encontrada');
        expect((await call(adminA, 'GET', `/templates?connectionId=${baysConnA}`)).statusCode).toBe(404);
        const missing = await call(adminA, 'GET', '/templates');
        expect(missing.statusCode).toBe(400);
        expect(errorText(missing)).toBe('connectionId é obrigatório');
    });

    it('cria template com os padrões (pt_BR, UTILITY, sem componentes)', async () => {
        graph('POST', (u) => u.endsWith(`/${WABA_A}/message_templates`), () => ({ id: 'tpl-1', status: 'PENDING' }));
        const res = await call(adminA, 'POST', '/templates', { connectionId: connA, name: '  aviso_pedido ' });
        expect(res.statusCode).toBe(201);
        expect(body(res)).toEqual({ id: 'tpl-1', status: 'PENDING' });
        const [[, init]] = sentTo('POST', '/message_templates');
        expect(JSON.parse(String((init as RequestInit).body))).toEqual({ name: 'aviso_pedido', language: 'pt_BR', category: 'UTILITY', components: [] });
    });

    it('sem nome → 400', async () => {
        const res = await call(adminA, 'POST', '/templates', { connectionId: connA, name: '  ' });
        expect(res.statusCode).toBe(400);
        expect(errorText(res)).toBe('connectionId e name são obrigatórios');
    });

    it('exclui template pelo nome', async () => {
        graph('DELETE', (u) => u.includes(`/${WABA_A}/message_templates?name=aviso%20velho`), () => ({ success: true }));
        const res = await call(adminA, 'DELETE', `/templates/${encodeURIComponent('aviso velho')}?connectionId=${connA}`);
        expect(res.statusCode).toBe(200);
        expect(body(res)).toEqual({ ok: true });
    });

    it('erro da Meta → 422 com a mensagem dela', async () => {
        graph('POST', (u) => u.endsWith(`/${WABA_A}/message_templates`), () => ({ error: { message: 'Template name already exists' } }), 400);
        const res = await call(adminA, 'POST', '/templates', { connectionId: connA, name: 'repetido' });
        expect(res.statusCode).toBe(422);
        expect(errorText(res)).toContain('Template name already exists');
    });

    it('[correção] atendente não cria nem exclui template', async () => {
        expect((await call(userA, 'POST', '/templates', { connectionId: connA, name: 'x' })).statusCode).toBe(403);
        expect((await call(userA, 'DELETE', `/templates/x?connectionId=${connA}`)).statusCode).toBe(403);
    });

    it('[correção] connectionId malformado → 400', async () => {
        const res = await call(adminA, 'GET', '/templates?connectionId=abc');
        expect(res.statusCode).toBe(400);
        expect(errorText(res)).toBe('connectionId inválido');
    });
});

describe('Envio', () => {
    it('envia template pelo telefone da conexão e devolve o wamid', async () => {
        graph('POST', (u) => u.endsWith(`/${PNID_A}/messages`), () => ({ messages: [{ id: 'wamid.TPL' }] }));
        const res = await call(userA, 'POST', '/send-template', { connectionId: connA, to: '+55 (11) 98888-7777', template: 'boas_vindas' });
        expect(res.statusCode).toBe(200);
        expect(body(res)).toEqual({ ok: true, wamid: 'wamid.TPL' });
        const [[, init]] = sentTo('POST', `/${PNID_A}/messages`);
        expect(JSON.parse(String((init as RequestInit).body))).toEqual({
            messaging_product: 'whatsapp', recipient_type: 'individual', to: '5511988887777',
            type: 'template', template: { name: 'boas_vindas', language: { code: 'pt_BR' } },
        });
    });

    it('faltando dados → 400', async () => {
        const res = await call(userA, 'POST', '/send-template', { connectionId: connA, to: '5511988887777' });
        expect(res.statusCode).toBe(400);
        expect(errorText(res)).toBe('connectionId, to e template são obrigatórios');
    });

    it('[correção] número inválido → 400 sem chamar a Meta', async () => {
        const res = await call(userA, 'POST', '/send-template', { connectionId: connA, to: 'abc', template: 'boas_vindas' });
        expect(res.statusCode).toBe(400);
        expect(errorText(res)).toBe('Número inválido');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('o envio de texto do atendimento sai pela Cloud API quando a conexão é oficial', async () => {
        graph('POST', (u) => u.endsWith(`/${PNID_A}/messages`), () => ({ messages: [{ id: 'wamid.TXT' }] }));
        const res = await whatsappService.sendTextToPhone(connA, '5511977776666', 'Olá pela oficial');
        expect(res).toEqual({ wabMessageId: 'wamid.TXT' });
        const [[, init]] = sentTo('POST', `/${PNID_A}/messages`);
        expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ to: '5511977776666', type: 'text', text: { body: 'Olá pela oficial', preview_url: false } });
    });
});

describe('Webhook de eventos', () => {
    const messagesOf = async (number: string) => {
        const [contact] = await db.select().from(contacts).where(and(eq(contacts.company_id, companyA), eq(contacts.number, number)));
        if (!contact) return { contact: undefined, messages: [] as (typeof atendimento_messages.$inferSelect)[] };
        return { contact, messages: await db.select().from(atendimento_messages).where(eq(atendimento_messages.contact_id, contact.id)) };
    };

    it('mensagem recebida: responde 200, cria contato, ticket e mensagem com o wamid', async () => {
        const from = `5511${String(SUFFIX).slice(-7)}1`;
        const res = await webhook(incoming(PNID_A, { from, id: `wamid.IN1.${SUFFIX}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Quero comprar' } }, 'Maria Oficial'));
        expect(res.statusCode).toBe(200);
        expect(body(res)).toEqual({ ok: true });
        // a mensagem é salva e o wamid gravado logo em seguida
        await vi.waitFor(async () => expect((await messagesOf(from)).messages[0]?.wab_message_id).toBe(`wamid.IN1.${SUFFIX}`));
        const { contact, messages } = await messagesOf(from);
        expect(contact).toMatchObject({ name: 'Maria Oficial' });
        expect(messages[0]).toMatchObject({ body: 'Quero comprar', from_me: false, wab_message_id: `wamid.IN1.${SUFFIX}` });
        const [ticket] = await db.select().from(tickets).where(eq(tickets.id, messages[0].ticket_id));
        expect(ticket).toMatchObject({ company_id: companyA, connection_id: connA, origin: 'WhatsApp Oficial' });
    });

    it('a mesma mensagem reenviada pela Meta não duplica', async () => {
        const from = `5511${String(SUFFIX).slice(-7)}2`;
        const msg = { from, id: `wamid.IN2.${SUFFIX}`, type: 'text', text: { body: 'oi' } };
        await webhook(incoming(PNID_A, msg));
        await vi.waitFor(async () => expect((await messagesOf(from)).messages[0]?.wab_message_id).toBe(msg.id));
        await webhook(incoming(PNID_A, msg));
        await new Promise((r) => setTimeout(r, 300));
        expect((await messagesOf(from)).messages).toHaveLength(1);
    });

    it('mensagem com mais de 24 h, sem conteúdo, de número desconhecido ou de outro objeto é ignorada', async () => {
        const from = `5511${String(SUFFIX).slice(-7)}3`;
        await webhook(incoming(PNID_A, { from, id: `wamid.OLD.${SUFFIX}`, timestamp: String(Math.floor(Date.now() / 1000) - 2 * 86400), type: 'text', text: { body: 'velha' } }));
        await webhook(incoming(PNID_A, { from, id: `wamid.EMPTY.${SUFFIX}`, type: 'unsupported' }));
        await webhook(incoming(`0${SUFFIX}`, { from, id: `wamid.UNK.${SUFFIX}`, type: 'text', text: { body: 'x' } }));
        await webhook({ ...incoming(PNID_A, { from, id: `wamid.OBJ.${SUFFIX}`, type: 'text', text: { body: 'x' } }), object: 'page' });
        await new Promise((r) => setTimeout(r, 400));
        expect((await messagesOf(from)).messages).toHaveLength(0);
    });

    it('imagem recebida: baixa da Meta e guarda no storage de mídias', async () => {
        const from = `5511${String(SUFFIX).slice(-7)}4`;
        graph('GET', (u) => u === `${GRAPH}/media-123`, () => ({ url: 'https://lookaside.fbsbx.com/media-123', mime_type: 'image/jpeg' }));
        graph('GET', (u) => u.startsWith('https://lookaside.fbsbx.com/'), () => Buffer.from('jpeg-bytes'));
        await webhook(incoming(PNID_A, { from, id: `wamid.IMG.${SUFFIX}`, type: 'image', image: { id: 'media-123', caption: 'foto do produto', mime_type: 'image/jpeg' } }));
        await vi.waitFor(async () => expect((await messagesOf(from)).messages).toHaveLength(1));
        const [m] = (await messagesOf(from)).messages;
        expect(m).toMatchObject({ body: 'foto do produto', media_type: 'image' });
        expect(m.media_url).toMatch(/\/wab\/.+\.jpg$/);
        const download = sentTo('GET', 'lookaside.fbsbx.com')[0][1] as { headers: Record<string, string> };
        expect(download.headers.Authorization).toBe('Bearer tok-a');
        // em teste o storage é o disco: confere os bytes gravados e apaga o arquivo
        expect(readFileSync(path.join(process.cwd(), m.media_url!.replace(/^\/+/, '')), 'utf8')).toBe('jpeg-bytes');
        await mediaStorage.delete(m.media_url!);
    });

    it('status de entrega atualiza o ack sem regredir; falha vai para o log de erros', async () => {
        const [t] = await db.insert(tickets).values({ company_id: companyA, contact_id: (await db.insert(contacts).values({ company_id: companyA, name: 'Ack', number: `5511${String(SUFFIX).slice(-7)}5` }).returning({ id: contacts.id }))[0].id, connection_id: connA, status_id: 2 }).returning({ id: tickets.id });
        const [m1, m2] = await db.insert(atendimento_messages).values([
            { ticket_id: t.id, body: 'a', from_me: true, ack: 1, wab_message_id: `wamid.OUT1.${SUFFIX}` },
            { ticket_id: t.id, body: 'b', from_me: true, ack: 1, wab_message_id: `wamid.OUT2.${SUFFIX}` },
        ]).returning({ id: atendimento_messages.id });
        const ackOf = async (id: number) => (await db.select({ ack: atendimento_messages.ack }).from(atendimento_messages).where(eq(atendimento_messages.id, id)))[0].ack;

        await webhook(statuses(PNID_A, [{ id: `wamid.OUT1.${SUFFIX}`, status: 'read' }]));
        await vi.waitFor(async () => expect(await ackOf(m1.id)).toBe(4));
        await webhook(statuses(PNID_A, [{ id: `wamid.OUT1.${SUFFIX}`, status: 'delivered' }]));
        await new Promise((r) => setTimeout(r, 200));
        expect(await ackOf(m1.id)).toBe(4);

        await webhook(statuses(PNID_A, [{ id: `wamid.OUT2.${SUFFIX}`, status: 'failed', errors: [{ code: 131026, message: 'Número sem WhatsApp' }] }]));
        await vi.waitFor(async () => {
            const logs = await db.select().from(connection_errors_log).where(and(eq(connection_errors_log.connection_id, connA), eq(connection_errors_log.error_type, 'wab_message_failed')));
            expect(logs.some((l) => l.error_code === 131026 && l.error_message === 'Número sem WhatsApp')).toBe(true);
        });
        expect(await ackOf(m2.id)).toBe(1);
    });

    it('[correção] com o segredo do app configurado, só aceita evento assinado pela Meta', async () => {
        (env as { WAB_APP_SECRET: string }).WAB_APP_SECRET = 'segredo-do-app';
        const from = `5511${String(SUFFIX).slice(-7)}6`;
        const forged = incoming(PNID_A, { from, id: `wamid.FAKE.${SUFFIX}`, type: 'text', text: { body: 'falsa' } });
        expect((await webhook(forged)).statusCode).toBe(401);
        expect((await webhook(forged, { 'x-hub-signature-256': 'sha256=deadbeef' })).statusCode).toBe(401);

        const real = incoming(PNID_A, { from, id: `wamid.REAL.${SUFFIX}`, type: 'text', text: { body: 'verdadeira' } });
        const raw = JSON.stringify(real);
        const signature = `sha256=${createHmac('sha256', 'segredo-do-app').update(raw).digest('hex')}`;
        const ok = await app.inject({ method: 'POST', url: '/wabcloudapi/webhook', payload: raw, headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature } });
        expect(ok.statusCode).toBe(200);
        await vi.waitFor(async () => expect((await messagesOf(from)).messages.map((m) => m.body)).toEqual(['verdadeira']));
    });
});
