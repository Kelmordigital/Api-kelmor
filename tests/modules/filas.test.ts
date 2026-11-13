import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import {
    connections, contacts, queues, tickets, userConnections, userQueues,
} from '../../src/modules/atendimento/atendimento.db.schema';
import { bots, bot_nodes } from '../../src/modules/bots/bots.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/** Filas: CRUD, listagens, atendentes elegíveis e efeitos de desativar/excluir. */

const SUFFIX = Date.now();
const app = buildApp();
let companyId: string;
let otherQueueId: number;
let connectionId: number;
let contactId: number;
let adminToken: string;
let userToken: string;
let superToken: string;
let attendantId: string;
let outsiderId: string;
let queueA: number;
let queueB: number;
let queueOff: number;

async function login(email: string, password = 'senha123') {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    return JSON.parse(res.body).access_token as string;
}

function call(token: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url = '', payload?: object) {
    return app.inject({
        method, url: `/api/v1/configuracao/filas${url}`,
        headers: { authorization: `Bearer ${token}` }, payload,
    });
}

const body = (res: { body: string }) => JSON.parse(res.body);

beforeAll(async () => {
    await app.ready();
    await runSeed();
    const tags = await db.select({ id: profiles.id, tag: profiles.tag }).from(profiles);
    const profileId = (tag: string) => tags.find((p) => p.tag === tag)!.id;

    const [co] = await db.insert(companies).values({ name: `Empresa Filas ${SUFFIX}`, status: true }).returning({ id: companies.id });
    companyId = co.id;
    const [other] = await db.insert(companies).values({ name: `Empresa Filas Outra ${SUFFIX}`, status: true }).returning({ id: companies.id });

    const person = (name: string, tag: string) => ({
        name, email: `filas-${name}-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
        profile_id: profileId(tag), company_id: companyId, email_verified: true, is_approved: true,
    });
    const [, attendant, outsider] = await db.insert(users).values([
        person('admin', 'admin'), person('atendente', 'user'), person('semconexao', 'user'),
    ]).returning({ id: users.id });
    attendantId = attendant.id;
    outsiderId = outsider.id;

    const [conn] = await db.insert(connections).values({ company_id: companyId, name: 'Conexão Filas', status: 'connected' }).returning({ id: connections.id });
    connectionId = conn.id;

    const rows = await db.insert(queues).values([
        { company_id: companyId, name: `Suporte ${SUFFIX}` },
        { company_id: companyId, name: `Financeiro ${SUFFIX}`, color: '#ff0000' },
        { company_id: companyId, name: `Desligada ${SUFFIX}`, enabled: false },
    ]).returning({ id: queues.id });
    [queueA, queueB, queueOff] = rows.map((r) => r.id);
    const [oq] = await db.insert(queues).values({ company_id: other.id, name: `Fila de Outra ${SUFFIX}` }).returning({ id: queues.id });
    otherQueueId = oq.id;

    // atendente: fila A + conexão; "semconexao": fila A, sem a conexão
    await db.insert(userQueues).values([
        { user_id: attendantId, queue_id: queueA },
        { user_id: outsiderId, queue_id: queueA },
    ]);
    await db.insert(userConnections).values({ user_id: attendantId, connection_id: connectionId });

    const [ct] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente Filas' }).returning({ id: contacts.id });
    contactId = ct.id;

    adminToken = await login(`filas-admin-${SUFFIX}@test.com`);
    userToken = await login(`filas-atendente-${SUFFIX}@test.com`);
    superToken = await login('filipe@kelmor.com', 'kelmor123');
});

afterAll(async () => { await app.close(); });

describe('Listagens (qualquer usuário da empresa)', () => {
    it('GET / traz as filas da empresa, inclusive desativadas, e nada de outra empresa', async () => {
        const list = body(await call(userToken, 'GET', '/')) as { id: number }[];
        const ids = list.map((q) => q.id);
        expect(ids).toEqual(expect.arrayContaining([queueA, queueB, queueOff]));
        expect(ids).not.toContain(otherQueueId);
    });

    it('GET /activequeue traz só as ativas, por nome', async () => {
        const list = body(await call(userToken, 'GET', '/activequeue')) as { id: number; name: string }[];
        expect(list.map((q) => q.id)).toEqual([queueB, queueA]); // Financeiro < Suporte
    });

    it('GET /userqueue traz só as filas do usuário', async () => {
        const list = body(await call(userToken, 'GET', '/userqueue')) as { id: number }[];
        expect(list.map((q) => q.id)).toEqual([queueA]);
    });

    it('GET /all pagina e busca por nome', async () => {
        const res = body(await call(userToken, 'GET', `/all?perPage=2&page=1&search=${SUFFIX}`));
        expect(res).toMatchObject({ count: 3, page: 1, totalPages: 2 });
        expect(res.queues).toHaveLength(2);

        const found = body(await call(userToken, 'GET', `/all?search=financeiro ${SUFFIX}`));
        expect(found.queues.map((q: { id: number }) => q.id)).toEqual([queueB]);
    });

    it('GET /:id → a fila; de outra empresa → 404', async () => {
        expect(body(await call(userToken, 'GET', `/${queueB}`))).toMatchObject({ id: queueB, color: '#ff0000', enabled: true, distribution: 'none' });
        const res = await call(userToken, 'GET', `/${otherQueueId}`);
        expect(res.statusCode).toBe(404);
        expect(body(res).error).toBe('Fila não encontrada');
    });

    it('GET /:id/:connectionId/users → quem está na fila E tem a conexão', async () => {
        const list = body(await call(userToken, 'GET', `/${queueA}/${connectionId}/users`)) as { id: string }[];
        expect(list.map((u) => u.id)).toEqual([attendantId]);
        // sem conexão (0): vale só a fila
        const all = body(await call(userToken, 'GET', `/${queueA}/0/users`)) as { id: string }[];
        expect(all.map((u) => u.id).sort()).toEqual([attendantId, outsiderId].sort());
    });
});

describe('Criar, editar, desativar e excluir (só admin)', () => {
    it('atendente não cria, edita nem exclui → 403', async () => {
        expect((await call(userToken, 'POST', '/', { name: 'X' })).statusCode).toBe(403);
        expect((await call(userToken, 'PUT', `/${queueA}`, { name: 'X' })).statusCode).toBe(403);
        expect((await call(userToken, 'DELETE', `/${queueA}`)).statusCode).toBe(403);
    });

    it('cria com padrões (ativa, sem distribuição); nome e saudação aparados; saudação vazia vira null', async () => {
        const res = await call(adminToken, 'POST', '/', { name: `  Vendas ${SUFFIX}  `, greeting_message: '   ' });
        expect(res.statusCode).toBe(201);
        expect(body(res)).toMatchObject({ name: `Vendas ${SUFFIX}`, enabled: true, distribution: 'none', greeting_message: null, color: null, company_id: companyId });

        const full = body(await call(adminToken, 'POST', '/', {
            name: `Pós-venda ${SUFFIX}`, color: '#00ff00', greeting_message: ' Olá! ', distribution: 'less_attendances', enabled: false,
        }));
        expect(full).toMatchObject({ color: '#00ff00', greeting_message: 'Olá!', distribution: 'less_attendances', enabled: false });
    });

    it('sem nome → 400', async () => {
        const res = await call(adminToken, 'POST', '/', { color: '#000' });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('name é obrigatório');
    });

    it('edita só os campos enviados; fila de outra empresa → 404', async () => {
        const res = await call(adminToken, 'PUT', `/${queueB}`, { distribution: 'attendant' });
        expect(body(res)).toMatchObject({ id: queueB, distribution: 'attendant', color: '#ff0000', name: `Financeiro ${SUFFIX}` });
        expect((await call(adminToken, 'PUT', `/${otherQueueId}`, { name: 'Invasão' })).statusCode).toBe(404);
    });

    it('desativar tira a fila dos tickets pendentes; tickets em atendimento ficam', async () => {
        const [pending, open] = await db.insert(tickets).values([
            { company_id: companyId, contact_id: contactId, queue_id: queueB, status_id: 1 },
            { company_id: companyId, contact_id: contactId, queue_id: queueB, status_id: 2 },
        ]).returning({ id: tickets.id });

        expect((await call(adminToken, 'PUT', `/${queueB}`, { enabled: false })).statusCode).toBe(200);
        const queueOf = async (id: number) => (await db.select({ q: tickets.queue_id }).from(tickets).where(eq(tickets.id, id)))[0].q;
        expect(await queueOf(pending.id)).toBeNull();
        expect(await queueOf(open.id)).toBe(queueB);
        await call(adminToken, 'PUT', `/${queueB}`, { enabled: true });
    });

    it('excluir: some das listas e solta todos os tickets da fila', async () => {
        const created = body(await call(adminToken, 'POST', '/', { name: `Temporária ${SUFFIX}` }));
        const [t] = await db.insert(tickets).values({ company_id: companyId, contact_id: contactId, queue_id: created.id, status_id: 2 }).returning({ id: tickets.id });

        const res = await call(adminToken, 'DELETE', `/${created.id}`);
        expect(res.statusCode).toBe(204);
        expect((await call(adminToken, 'GET', `/${created.id}`)).statusCode).toBe(404);
        expect((body(await call(adminToken, 'GET', '/')) as { id: number }[]).map((q) => q.id)).not.toContain(created.id);
        expect((await db.select({ q: tickets.queue_id }).from(tickets).where(eq(tickets.id, t.id)))[0].q).toBeNull();
        expect((await call(adminToken, 'DELETE', `/${created.id}`)).statusCode).toBe(404);
    });

    it('fila usada por um bot ativo não pode ser excluída → 409', async () => {
        const created = body(await call(adminToken, 'POST', '/', { name: `Do Bot ${SUFFIX}` }));
        const [bot] = await db.insert(bots).values({ company_id: companyId, name: 'Bot Filas', active: true }).returning();
        await db.insert(bot_nodes).values({ id: `transfer-${SUFFIX}`, bot_id: bot.id, company_id: companyId, type: 'transfer', label: 'Transferir', queue_id: created.id });

        const res = await call(adminToken, 'DELETE', `/${created.id}`);
        expect(res.statusCode).toBe(409);
        expect(body(res).error).toBe('Não é possível excluir a fila, pois ela está vinculada a um chatbot.');
    });
});

describe('Correções da refatoração', () => {
    it('id malformado → 400 "id inválido" (antes: 500)', async () => {
        const res = await call(userToken, 'GET', '/abc');
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('id inválido');
        expect((await call(adminToken, 'PUT', '/abc', { name: 'Xy' })).statusCode).toBe(400);
    });

    it('nome só com espaços na edição → 400 (antes: gravava nome vazio)', async () => {
        const res = await call(adminToken, 'PUT', `/${queueA}`, { name: '   ' });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('name é obrigatório');
    });

    it('nome com mais de 255 caracteres → 400 (antes: 500)', async () => {
        const res = await call(adminToken, 'POST', '/', { name: 'x'.repeat(256) });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('O nome da fila deve ter no máximo 255 caracteres');
    });

    it('modo de distribuição desconhecido → 400 (antes: trocado por "none" em silêncio)', async () => {
        const res = await call(adminToken, 'POST', '/', { name: `Modo ${SUFFIX}`, distribution: 'roleta' });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('Modo de distribuição inválido');
    });

    it('busca trata % e _ como texto (antes: % listava tudo)', async () => {
        const res = body(await call(userToken, 'GET', '/all?search=%25'));
        expect(res.count).toBe(0);
    });

    it('paginação com valor não numérico usa o padrão (antes: 500)', async () => {
        const res = await call(userToken, 'GET', '/all?page=abc&perPage=xyz');
        expect(res.statusCode).toBe(200);
        expect(body(res)).toMatchObject({ page: 1 });
    });

    it('superAdmin (sem empresa) → 403 "Empresa não encontrada" (antes: 500 ao criar)', async () => {
        const res = await call(superToken, 'POST', '/', { name: 'Fila do super' });
        expect(res.statusCode).toBe(403);
        expect(body(res).error).toBe('Empresa não encontrada');
    });
});
