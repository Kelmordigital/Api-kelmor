import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { connections, contacts } from '../../src/modules/atendimento/atendimento.db.schema';
import { env } from '../../src/config/env';
import { buildApp } from '../../src/shared/server';

/**
 * Campanhas: a API é um proxy escopado por empresa para o microsserviço
 * `campaigns`, aqui substituído por um servidor falso que registra as chamadas.
 * Os textos de agendamento são locais.
 */

const SUFFIX = Date.now();
const BASE = '/api/v1/configuracao/mensagens-agendadas';

interface Received { method: string; url: string; secret: string | undefined; body: Record<string, unknown> | null }

class FakeCampaignsService {
    received: Received[] = [];
    reply: { status: number; body: unknown } = { status: 200, body: { ok: true } };
    private server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (c) => { raw += c; });
        req.on('end', () => {
            this.received.push({
                method: req.method!, url: req.url!,
                secret: req.headers['x-internal-secret'] as string | undefined,
                body: raw ? JSON.parse(raw) : null,
            });
            res.writeHead(this.reply.status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(this.reply.body));
        });
    });

    listen(port: number) { return new Promise<void>((r) => this.server.listen(port, '127.0.0.1', () => r())); }
    close() { return new Promise<void>((r) => this.server.close(() => r())); }
    get last() { return this.received[this.received.length - 1]; }
}

describe('Campanhas', () => {
    const app = buildApp();
    const fake = new FakeCampaignsService();
    let companyId: string;
    let adminToken: string;
    let attendantToken: string;
    let otherAdminToken: string;
    let ownConnection: number;
    let foreignConnection: number;
    let ownContact: number;
    let foreignContact: number;

    beforeAll(async () => {
        await fake.listen(Number(new URL(env.CAMPAIGNS_API_URL).port));
        await app.ready();
        const [up] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [ap] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies).values({ name: `Empresa Campanhas ${label} ${SUFFIX}`, status: true }).returning({ id: companies.id });
            return co.id;
        }
        async function makeUser(label: string, profileId: number, coId: string) {
            const email = `campanhas-${label}-${SUFFIX}@test.com`;
            await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId, email_verified: true, is_approved: true,
            });
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha123' } });
            return JSON.parse(res.body).access_token as string;
        }

        companyId = await makeCompany('A');
        const otherCompanyId = await makeCompany('B');
        adminToken = await makeUser('admin', ap.id, companyId);
        attendantToken = await makeUser('attendant', up.id, companyId);
        otherAdminToken = await makeUser('other', ap.id, otherCompanyId);

        [ownConnection] = (await db.insert(connections).values({ company_id: companyId, name: 'WA A' }).returning({ id: connections.id })).map((c) => c.id);
        [foreignConnection] = (await db.insert(connections).values({ company_id: otherCompanyId, name: 'WA B' }).returning({ id: connections.id })).map((c) => c.id);
        [ownContact] = (await db.insert(contacts).values({ company_id: companyId, name: 'Cliente A', number: '5511911110000' }).returning({ id: contacts.id })).map((c) => c.id);
        [foreignContact] = (await db.insert(contacts).values({ company_id: otherCompanyId, name: 'Cliente B' }).returning({ id: contacts.id })).map((c) => c.id);
    });

    afterAll(async () => { await app.close(); await fake.close(); });
    beforeEach(() => { fake.received = []; fake.reply = { status: 200, body: { ok: true } }; });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object, token = adminToken) =>
        app.inject({ method, url: `${BASE}${url}`, headers: as(token), ...(payload ? { payload } : {}) });
    const messageOf = (res: { body: string }) => JSON.parse(res.body).message;
    const campaign = (over: Record<string, unknown> = {}) => ({
        title: ' Black Friday ', message: ' Promoção! ', send_date: '2030-11-27T12:00:00.000Z', connection_ids: [ownConnection], ...over,
    });

    describe('proxy para o microsserviço', () => {
        it('lista as campanhas da empresa', async () => {
            fake.reply = { status: 200, body: [{ id: 1, title: 'X' }] };
            const res = await call('GET', '');
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual([{ id: 1, title: 'X' }]);
            expect(fake.last).toMatchObject({ method: 'GET', url: `/campaign?company_id=${companyId}`, secret: env.INTERNAL_API_SECRET });
        });

        it('cria: repassa os dados com a empresa, sem conexões e contatos de outra empresa', async () => {
            fake.reply = { status: 201, body: { id: 7 } };
            const res = await call('POST', '', campaign({
                connection_ids: [ownConnection, foreignConnection], contact_ids: [ownContact, foreignContact], all_contacts: false,
            }));
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toEqual({ id: 7 });
            expect(fake.last).toMatchObject({ method: 'POST', url: '/campaign' });
            expect(fake.last.body).toMatchObject({
                company_id: companyId, title: 'Black Friday', message: 'Promoção!', send_date: '2030-11-27T12:00:00.000Z',
                connection_ids: [ownConnection], contact_ids: [ownContact], all_contacts: false,
            });
        });

        it.each([
            [{ title: '  ' },          'O título é obrigatório'],
            [{ message: '' },          'A mensagem é obrigatória'],
            [{ send_date: undefined }, 'A data de envio é obrigatória'],
            [{ connection_ids: [] },   'Selecione ao menos uma conexão'],
        ])('criação 400 para %j, sem chamar o microsserviço', async (over, message) => {
            const res = await call('POST', '', campaign(over));
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe(message);
            expect(fake.received).toHaveLength(0);
        });

        it('edição repassa só o enviado, com as conexões filtradas', async () => {
            const res = await call('PUT', '/5', { title: 'Novo', connection_ids: [ownConnection, foreignConnection] });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ ok: true });
            expect(fake.last).toMatchObject({ method: 'PUT', url: '/campaign/5' });
            expect(fake.last.body).toEqual({ company_id: companyId, title: 'Novo', connection_ids: [ownConnection] });
        });

        it('excluir, iniciar e pausar repassam com a empresa; 404 do microsserviço vira 404', async () => {
            for (const [method, url, upstream] of [
                ['DELETE', '/5', 'DELETE /campaign/5'],
                ['POST', '/5/play', 'POST /campaign/5/play'],
                ['POST', '/5/pause', 'POST /campaign/5/pause'],
            ] as const) {
                fake.reply = { status: 200, body: { ok: true } };
                const ok = await call(method, url);
                expect(JSON.parse(ok.body)).toEqual({ ok: true });
                expect(`${fake.last.method} ${fake.last.url}`).toBe(`${upstream}?company_id=${companyId}`);

                fake.reply = { status: 404, body: { message: 'Campanha não encontrada' } };
                const missing = await call(method, url);
                expect(missing.statusCode).toBe(404);
                expect(messageOf(missing)).toBe('Campanha não encontrada');
            }
        });

        it('atendente não acessa (403)', async () => {
            expect((await call('GET', '', undefined, attendantToken)).statusCode).toBe(403);
        });
    });

    describe('opções', () => {
        it('conexões e contatos da empresa', async () => {
            const body = JSON.parse((await call('GET', '/selects')).body);
            expect(body.connections.map((c: { id: number }) => c.id)).toEqual([ownConnection]);
            expect(body.contacts.map((c: { id: number }) => c.id)).toEqual([ownContact]);
        });
    });

    describe('textos de agendamento', () => {
        it('a empresa começa sem textos (nenhum texto padrão é criado)', async () => {
            expect(JSON.parse((await call('GET', '/texts', undefined, otherAdminToken)).body)).toEqual([]);
        });

        it('admin cadastra, edita e exclui; lista na ordem de criação, só da empresa', async () => {
            const first = await call('POST', '/texts', { label: ' Recompra ', text: 'Oi! Vamos repor?' });
            expect(first.statusCode).toBe(201);
            const a = JSON.parse(first.body);
            expect(a).toMatchObject({ company_id: companyId, label: 'Recompra', text: 'Oi! Vamos repor?' });
            const b = JSON.parse((await call('POST', '/texts', { label: 'Lembrete' })).body);
            expect(b).toMatchObject({ label: 'Lembrete', text: null });

            const list = JSON.parse((await call('GET', '/texts')).body) as { id: number }[];
            expect(list.map((t) => t.id)).toEqual([a.id, b.id]);
            expect(JSON.parse((await call('GET', '/texts', undefined, otherAdminToken)).body)).toEqual([]);

            const edited = JSON.parse((await call('PUT', `/texts/${a.id}`, { label: ' Final ', text: 'Tchau' })).body);
            expect(edited).toMatchObject({ id: a.id, label: 'Final', text: 'Tchau' });
            expect((await call('PUT', `/texts/${a.id}`, { label: 'x' }, otherAdminToken)).statusCode).toBe(404);

            expect(JSON.parse((await call('DELETE', `/texts/${a.id}`)).body)).toEqual({ ok: true });
            const missing = await call('DELETE', `/texts/${a.id}`);
            expect(missing.statusCode).toBe(404);
            expect(messageOf(missing)).toBe('Texto não encontrado');
            expect((JSON.parse((await call('GET', '/texts')).body) as { id: number }[]).map((t) => t.id)).toEqual([b.id]);
        });

        it('atendente lê os textos (para o modal de agendamento), mas não cadastra', async () => {
            const res = await call('GET', '/texts', undefined, attendantToken);
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(JSON.parse(res.body))).toBe(true);
            expect((await call('POST', '/texts', { label: 'X' }, attendantToken)).statusCode).toBe(403);
        });

        it('rótulo obrigatório', async () => {
            expect(messageOf(await call('POST', '/texts', { label: ' ' }))).toBe('O rótulo é obrigatório');
            expect(messageOf(await call('PUT', '/texts/1', { label: '' }))).toBe('O rótulo é obrigatório');
        });
    });

    describe('falhas e validação', () => {
        it('edição de campanha que o microsserviço não encontra → 404 (antes: { ok: true })', async () => {
            fake.reply = { status: 404, body: { message: 'Campanha não encontrada' } };
            const res = await call('PUT', '/5', { title: 'x' });
            expect(res.statusCode).toBe(404);
            expect(messageOf(res)).toBe('Campanha não encontrada');
        });

        it('erro de validação do microsserviço chega com a mensagem dele', async () => {
            fake.reply = { status: 400, body: { statusCode: 400, error: 'Bad Request', message: 'send_date no passado' } };
            const res = await call('POST', '', campaign());
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe('send_date no passado');
        });

        it('microsserviço com erro → 502, não "não encontrada"', async () => {
            fake.reply = { status: 500, body: { message: 'boom' } };
            for (const [method, url] of [['GET', ''], ['POST', '/5/play'], ['DELETE', '/5'], ['PUT', '/5']] as const) {
                const res = await call(method, url, method === 'PUT' ? { title: 'x' } : undefined);
                expect(res.statusCode).toBe(502);
                expect(messageOf(res)).toBe('Serviço de campanhas indisponível. Tente novamente.');
            }
        });

        it('todas as conexões de outra empresa → 400 sem chamar o microsserviço', async () => {
            const res = await call('POST', '', campaign({ connection_ids: [foreignConnection] }));
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe('Selecione ao menos uma conexão');
            expect(fake.received).toHaveLength(0);
        });

        it.each([
            ['POST', '',       campaign({ send_date: 'amanhã' }),          'A data de envio é inválida'],
            ['POST', '',       campaign({ title: 'x'.repeat(201) }),       'O título deve ter no máximo 200 caracteres'],
            ['POST', '',       campaign({ connection_ids: ['wa'] }),       'connection_ids inválido'],
            ['PUT',  '/abc',   { title: 'x' },                             'id inválido'],
            ['POST', '/texts', { label: 'x'.repeat(201) },                 'O rótulo deve ter no máximo 200 caracteres'],
        ] as const)('%s %s → 400', async (method, url, payload, message) => {
            const res = await call(method, url, payload);
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe(message);
        });
    });
});
