import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users, refreshTokens } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { queues, connections, userQueues } from '../../src/modules/atendimento/atendimento.db.schema';
import { buildApp } from '../../src/shared/server';

/** Gestão de usuários da empresa pelo admin. */

const SUFFIX = Date.now();
const BASE = '/api/v1/configuracao/usuarios';

interface ListedUser { id: string; email: string; profile_tag: string; queue_ids: number[]; connection_ids: number[]; patente: string; patente_sub_level: number | null; avatar_url: string | null }

describe('Usuários', () => {
    const app = buildApp();
    let companyId: string;
    let adminId: string;
    let adminToken: string;
    let attendantToken: string;
    let otherAdminToken: string;
    let otherUserId: string;
    let userProfileId: number;
    let adminProfileId: number;
    let ownQueue: number;
    let ownConnection: number;
    let foreignQueue: number;
    let seq = 0;

    const login = async (email: string, password: string) => {
        const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
        return { status: res.statusCode, token: JSON.parse(res.body).access_token as string | undefined };
    };

    beforeAll(async () => {
        await app.ready();
        const [up] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [ap] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
        userProfileId = up.id;
        adminProfileId = ap.id;

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies).values({ name: `Empresa Usuarios ${label} ${SUFFIX}`, status: true }).returning({ id: companies.id });
            return co.id;
        }
        async function makeUser(label: string, profileId: number, coId: string) {
            const email = `usuarios-${label}-${SUFFIX}@test.com`;
            const [u] = await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId, email_verified: true, is_approved: true,
            }).returning({ id: users.id });
            return { id: u.id, token: (await login(email, 'senha123')).token! };
        }

        companyId = await makeCompany('A');
        const otherCompanyId = await makeCompany('B');
        const admin = await makeUser('admin', adminProfileId, companyId);
        adminId = admin.id; adminToken = admin.token;
        attendantToken = (await makeUser('attendant', userProfileId, companyId)).token;
        const other = await makeUser('other-admin', adminProfileId, otherCompanyId);
        otherAdminToken = other.token; otherUserId = other.id;

        [ownQueue] = (await db.insert(queues).values({ company_id: companyId, name: 'Vendas' }).returning({ id: queues.id })).map((q) => q.id);
        [ownConnection] = (await db.insert(connections).values({ company_id: companyId, name: 'WA' }).returning({ id: connections.id })).map((c) => c.id);
        [foreignQueue] = (await db.insert(queues).values({ company_id: otherCompanyId, name: 'Fila B' }).returning({ id: queues.id })).map((q) => q.id);
    });

    afterAll(async () => { await app.close(); });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object, token = adminToken) =>
        app.inject({ method, url: `${BASE}${url}`, headers: as(token), ...(payload ? { payload } : {}) });
    const list = async (token = adminToken) => JSON.parse((await call('GET', '', undefined, token)).body) as ListedUser[];
    const newEmail = () => `usuarios-novo-${SUFFIX}-${++seq}@test.com`;
    const createUser = async (over: Record<string, unknown> = {}) => {
        const email = newEmail();
        const res = await call('POST', '', { name: 'Novo', email, password: 'senha1234', ...over });
        return { res, email, body: JSON.parse(res.body) };
    };
    const messageOf = (res: { body: string }) => JSON.parse(res.body).message;
    const me = (token: string) => app.inject({ method: 'GET', url: '/api/v1/configuracao/meu-perfil', headers: as(token) });

    describe('listagem e opções', () => {
        it('lista os usuários da empresa com perfil, filas, conexões e patente', async () => {
            const users = await list();
            expect(users.length).toBeGreaterThanOrEqual(2);
            const admin = users.find((u) => u.id === adminId)!;
            expect(admin).toMatchObject({ profile_tag: 'admin', queue_ids: [], connection_ids: [], patente: 'Aprendiz', patente_sub_level: null, avatar_url: null });
            expect(users.some((u) => u.id === otherUserId)).toBe(false);
            expect(admin).not.toHaveProperty('password_hash');
        });

        it('opções: filas e conexões da empresa', async () => {
            const body = JSON.parse((await call('GET', '/selects')).body);
            expect(body.queues.map((q: { id: number }) => q.id)).toEqual([ownQueue]);
            expect(body.connections.map((c: { id: number }) => c.id)).toEqual([ownConnection]);
        });

        it('atendente não acessa (403)', async () => {
            expect((await call('GET', '', undefined, attendantToken)).statusCode).toBe(403);
        });
    });

    describe('criação', () => {
        it('cria aprovado, com e-mail em minúsculas, perfil atendente por padrão; já consegue entrar', async () => {
            const email = newEmail();
            const res = await call('POST', '', { name: '  Joana  ', email: `  ${email.toUpperCase()}  `, password: ' senha1234 ', queue_ids: [ownQueue], connection_ids: [ownConnection] });
            expect(res.statusCode).toBe(201);
            const body = JSON.parse(res.body);
            expect(body).toMatchObject({ name: 'Joana', email, company_id: companyId, profile_id: userProfileId, is_approved: true, queue_ids: [ownQueue], connection_ids: [ownConnection] });
            expect((await login(email, 'senha1234')).status).toBe(200);
        });

        it('400 sem nome/e-mail/senha; 403 para superAdmin; 409 para e-mail repetido (sem diferenciar maiúsculas)', async () => {
            const missing = await call('POST', '', { name: 'X', email: newEmail() });
            expect(missing.statusCode).toBe(400);
            expect(messageOf(missing)).toBe('Nome, e-mail e senha são obrigatórios');

            const sa = await createUser({ profile_id: 3 });
            expect(sa.res.statusCode).toBe(403);
            expect(messageOf(sa.res)).toBe('Não é permitido criar superAdmin');

            const first = await createUser();
            const dup = await call('POST', '', { name: 'Dup', email: first.email.toUpperCase(), password: 'senha1234' });
            expect(dup.statusCode).toBe(409);
            expect(messageOf(dup)).toBe('E-mail já cadastrado');
        });
    });

    describe('edição', () => {
        it('altera nome, e-mail, perfil e senha; substitui filas e conexões; responde { ok: true }', async () => {
            const { body } = await createUser({ queue_ids: [ownQueue] });
            const email = newEmail();
            const res = await call('PUT', `/${body.id}`, { name: 'Renomeado', email: email.toUpperCase(), profile_id: adminProfileId, password: 'novasenha99', queue_ids: [], connection_ids: [ownConnection] });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ ok: true });

            const edited = (await list()).find((u) => u.id === body.id)!;
            expect(edited).toMatchObject({ email, profile_tag: 'admin', queue_ids: [], connection_ids: [ownConnection] });
            expect((await login(email, 'novasenha99')).status).toBe(200);
        });

        it('filas de outra empresa são ignoradas', async () => {
            const { body } = await createUser();
            await call('PUT', `/${body.id}`, { queue_ids: [ownQueue, foreignQueue] });
            const rows = await db.select().from(userQueues).where(eq(userQueues.user_id, body.id));
            expect(rows.map((r) => r.queue_id)).toEqual([ownQueue]);
        });

        it('404 para usuário de outra empresa; 403 ao tentar virar superAdmin', async () => {
            const res = await call('PUT', `/${otherUserId}`, { name: 'Invadido', queue_ids: [ownQueue] });
            expect(res.statusCode).toBe(404);
            expect(messageOf(res)).toBe('Usuário não encontrado');
            const { body } = await createUser();
            const sa = await call('PUT', `/${body.id}`, { profile_id: 3 });
            expect(sa.statusCode).toBe(403);
            expect(messageOf(sa)).toBe('Não é permitido definir superAdmin');
        });
    });

    describe('exclusão', () => {
        it('não exclui a si mesmo; exclui outro (200 { ok: true }); depois 404; outra empresa 404', async () => {
            const self = await call('DELETE', `/${adminId}`);
            expect(self.statusCode).toBe(400);
            expect(messageOf(self)).toBe('Você não pode excluir seu próprio usuário');

            const { body } = await createUser();
            const del = await call('DELETE', `/${body.id}`);
            expect(JSON.parse(del.body)).toEqual({ ok: true });
            expect((await call('DELETE', `/${body.id}`)).statusCode).toBe(404);
            expect((await call('DELETE', `/${otherUserId}`)).statusCode).toBe(404);
        });
    });

    describe('segurança', () => {
        it('a criação não devolve o hash da senha', async () => {
            const { body } = await createUser();
            expect(body).not.toHaveProperty('password_hash');
            expect(body).not.toHaveProperty('totp_secret');
        });

        it('a criação ignora filas de outra empresa', async () => {
            const { body } = await createUser({ queue_ids: [ownQueue, foreignQueue] });
            expect(body.queue_ids).toEqual([ownQueue]);
            const rows = await db.select().from(userQueues).where(eq(userQueues.user_id, body.id));
            expect(rows.map((r) => r.queue_id)).toEqual([ownQueue]);
        });

        it('usuário excluído perde o acesso na hora', async () => {
            const { body, email } = await createUser();
            const { token } = await login(email, 'senha1234');
            expect((await me(token!)).statusCode).toBe(200);
            await call('DELETE', `/${body.id}`);
            expect((await me(token!)).statusCode).toBe(401);
        });

        it('trocar a senha ou o perfil derruba as sessões abertas do usuário', async () => {
            for (const change of [{ password: 'outrasenha1' }, { profile_id: adminProfileId }]) {
                const { body, email } = await createUser();
                const { token } = await login(email, 'senha1234');
                await call('PUT', `/${body.id}`, change);
                expect((await me(token!)).statusCode).toBe(401);
                if ('password' in change) {
                    expect(await db.select().from(refreshTokens).where(eq(refreshTokens.user_id, body.id))).toHaveLength(0);
                }
            }
        });

        it('trocar só o nome não derruba a sessão', async () => {
            const { body, email } = await createUser();
            const { token } = await login(email, 'senha1234');
            await call('PUT', `/${body.id}`, { name: 'Só o nome' });
            expect((await me(token!)).statusCode).toBe(200);
        });

        it('e-mail já usado por outra pessoa na edição → 409 (antes: 500)', async () => {
            const a = await createUser();
            const b = await createUser();
            const res = await call('PUT', `/${b.body.id}`, { email: a.email });
            expect(res.statusCode).toBe(409);
            expect(messageOf(res)).toBe('E-mail já cadastrado');
        });

        it.each([
            ['POST', '',            { name: 'X', email: 'sem-arroba', password: 'senha1234' },  'E-mail inválido'],
            ['POST', '',            { name: 'X', email: 'curta@test.com', password: '1234567' }, 'A senha deve ter no mínimo 8 caracteres'],
            ['POST', '',            { name: 'X', email: 'perfil@test.com', password: 'senha1234', profile_id: 99 }, 'Perfil inválido'],
            ['POST', '',            { name: 'X', email: 'fila@test.com', password: 'senha1234', queue_ids: ['vendas'] }, 'queue_ids inválido'],
            ['PUT',  '/nao-e-uuid', { name: 'X' },                                             'id inválido'],
        ] as const)('%s %s → 400', async (method, url, payload, message) => {
            const res = await call(method, url, payload);
            expect(res.statusCode).toBe(400);
            expect(messageOf(res)).toBe(message);
        });
    });
});
