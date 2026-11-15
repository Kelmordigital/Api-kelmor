import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, connections, tickets, historic_tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';
import { CustomerValueQueries } from '../../src/modules/dashboard/customer-value.queries';

const SUFFIX = Date.now();
const now = new Date('2026-11-15T12:00:00Z');
const SET = new Date('2026-09-15T15:00:00Z');
const OUT = new Date('2026-10-15T15:00:00Z');
const NOV = new Date('2026-11-15T15:00:00Z');
const queries = new CustomerValueQueries(db);

let companyId: string;      // Ana, Bruno, Carla + ruídos
let simpleCompanyId: string; // só Ana e Bruno (resumo exato)
let emptyCompanyId: string;
let connA: number;
let connB: number;
const ids: Record<string, number> = {};

async function contact(company: string, name: string, number?: string) {
    const [c] = await db.insert(contacts).values({ company_id: company, name, number: number ?? null }).returning({ id: contacts.id });
    ids[`${company}:${name}`] = c.id;
    return c.id;
}

/** Venda fechada com a(s) data(s) de fechamento no histórico. */
async function sale(company: string, contactId: number, price: string, closedAt: Date[], extra: Partial<typeof tickets.$inferInsert> = {}) {
    const [t] = await db.insert(tickets).values({
        company_id: company, contact_id: contactId, status_id: 3, is_sale: 1, service_not_made: 0,
        sale_price: price, updated_at: NOV, ...extra,
    }).returning({ id: tickets.id });
    for (const at of closedAt) {
        await db.insert(historic_tickets).values({ ticket_id: t.id, user_id: null, status_id_init: 2, status_id_end: 3, created_at: at });
    }
    return t.id;
}

beforeAll(async () => {
    await runSeed();
    const mk = async (name: string) => (await db.insert(companies).values({ name: `${name} ${SUFFIX}`, status: true }).returning({ id: companies.id }))[0].id;
    companyId = await mk('LTV');
    simpleCompanyId = await mk('LTV simples');
    emptyCompanyId = await mk('LTV vazia');
    [{ id: connA }] = await db.insert(connections).values({ company_id: companyId, name: 'A' }).returning({ id: connections.id });
    [{ id: connB }] = await db.insert(connections).values({ company_id: companyId, name: 'B' }).returning({ id: connections.id });

    for (const co of [companyId, simpleCompanyId]) {
        const ana = await contact(co, 'Ana', `5531999${SUFFIX}`.slice(0, 13));
        const bruno = await contact(co, 'Bruno');
        await sale(co, ana, '1.000,00', [SET], co === companyId ? { connection_id: connA } : {});
        await sale(co, ana, '500,00', [NOV], co === companyId ? { connection_id: connA } : {});
        await sale(co, bruno, '300,00', [NOV], co === companyId ? { connection_id: connB } : {});
    }

    // Ruídos e casos de borda só na empresa principal
    const carla = await contact(companyId, 'Carla');
    await sale(companyId, carla, '200,00', [OUT]);                                  // updated_at em nov, fechou em out
    await sale(companyId, carla, '999,00', [NOV], { is_sale: 0 });                  // não venda
    await sale(companyId, carla, '999,00', [NOV], { deleted_at: NOV });             // deletado
    await sale(companyId, carla, '999,00', [NOV], { service_not_made: 1 });         // atendimento não realizado
    const dani = await contact(companyId, 'Dani');
    await sale(companyId, dani, '', [NOV]);                                          // preço vazio
    const edu = await contact(companyId, 'Edu');
    await sale(companyId, edu, '100,00', [SET, OUT]);                                // reaberto e fechado de novo
});

describe('ranking de clientes (quanto cada um já gastou)', () => {
    it('soma por cliente, faixa de 12 meses e ordena por total', async () => {
        const { items } = await queries.ranking(companyId, { sort: 'total', limit: 50, offset: 0, now });
        const ana = items.find((i) => i.name === 'Ana')!;
        expect(items[0].name).toBe('Ana');
        expect(ana).toMatchObject({ total: 1500, purchases: 2 });
        expect(ana.months).toHaveLength(12);
        expect(ana.months[9]).toBe(1000);
        expect(ana.months[11]).toBe(500);
        expect(items.find((i) => i.name === 'Bruno')!.total).toBe(300);
    });

    it('usa a data de fechamento do histórico, não a última alteração do ticket', async () => {
        const { items } = await queries.ranking(companyId, { sort: 'total', limit: 50, offset: 0, now });
        const carla = items.find((i) => i.name === 'Carla')!;
        expect(carla.total).toBe(200);           // não venda, deletado e não realizado ficam de fora
        expect(carla.months[10]).toBe(200);      // outubro
        expect(carla.months[11]).toBe(0);
    });

    it('preço vazio conta como 0 sem derrubar a consulta (Review Focus 1)', async () => {
        const { items } = await queries.ranking(companyId, { sort: 'total', limit: 50, offset: 0, now });
        expect(items.find((i) => i.name === 'Dani')).toMatchObject({ total: 0, purchases: 1 });
    });

    it('ticket fechado duas vezes conta na última data (Review Focus 3)', async () => {
        const { items } = await queries.ranking(companyId, { sort: 'total', limit: 50, offset: 0, now });
        const edu = items.find((i) => i.name === 'Edu')!;
        expect(edu.months[10]).toBe(100);
        expect(edu.months[9]).toBe(0);
    });

    it('busca com % é texto, não curinga (Review Focus 4)', async () => {
        expect((await queries.ranking(companyId, { search: '%', sort: 'total', limit: 50, offset: 0, now })).items).toHaveLength(0);
        expect((await queries.ranking(companyId, { search: 'brun', sort: 'total', limit: 50, offset: 0, now })).items.map((i) => i.name)).toEqual(['Bruno']);
    });

    it('filtra por conexão', async () => {
        const { items, total } = await queries.ranking(companyId, { connectionId: connB, sort: 'total', limit: 50, offset: 0, now });
        expect(total).toBe(1);
        expect(items.map((i) => i.name)).toEqual(['Bruno']);
    });
});

describe('resumo (LTV, recompra e mapa por mês da 1ª compra)', () => {
    it('calcula os números e o mapa', async () => {
        const s = await queries.summary(simpleCompanyId, { now });
        expect(s).toMatchObject({ customers: 2, ltv: 900, repeatRate: 0.5, avgTicket: 600 });
        expect(s.cohorts).toEqual([
            { month: '2026-09', customers: 1, retention: [1, 0, 1] },
            { month: '2026-11', customers: 1, retention: [1] },
        ]);
    });

    it('empresa sem vendas sai zerada, sem divisão por zero (Review Focus 2)', async () => {
        expect(await queries.summary(emptyCompanyId, { now })).toEqual({ ltv: 0, repeatRate: 0, customers: 0, avgTicket: 0, cohorts: [] });
    });
});

describe('HTTP /financeiro/clientes', () => {
    const app = buildApp();
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
        const tags = await db.select({ id: profiles.id, tag: profiles.tag }).from(profiles);
        const person = (tag: string) => ({
            name: tag, email: `ltv-${tag}-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
            profile_id: tags.find((p) => p.tag === tag)!.id, company_id: simpleCompanyId, email_verified: true, is_approved: true,
        });
        await db.insert(users).values([person('admin'), person('user')]);
        await app.ready();
        const login = async (tag: string) => JSON.parse((await app.inject({
            method: 'POST', url: '/api/v1/auth/login', payload: { email: `ltv-${tag}-${SUFFIX}@test.com`, password: 'senha123' },
        })).body).access_token as string;
        adminToken = await login('admin');
        userToken = await login('user');
    });

    const get = (url: string, token: string) => app.inject({ method: 'GET', url: `/api/v1/atendimento${url}`, headers: { authorization: `Bearer ${token}` } });

    it('admin vê o ranking e o resumo', async () => {
        const rank = await get('/financeiro/clientes?sort=total&connectionId=&search=', adminToken);
        expect(rank.statusCode).toBe(200);
        expect(JSON.parse(rank.body).items[0].name).toBe('Ana');
        const sum = await get('/financeiro/clientes/resumo', adminToken);
        expect(sum.statusCode).toBe(200);
        expect(JSON.parse(sum.body).customers).toBe(2);
    });

    it('atendente recebe 403 (Review Focus 5)', async () => {
        expect((await get('/financeiro/clientes', userToken)).statusCode).toBe(403);
        expect((await get('/financeiro/clientes/resumo', userToken)).statusCode).toBe(403);
    });

    it('limpa', async () => {
        await db.delete(users).where(eq(users.company_id, simpleCompanyId));
    });
});
