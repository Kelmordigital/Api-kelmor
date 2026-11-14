import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, crm_sales_reasons, queues, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { matchKeywordOrigin } from '../../src/modules/crm/crm-config.service';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/** CRM: motivos de não venda, palavras-chave de origem e relatórios de venda. */

const SUFFIX = Date.now();
const app = buildApp();
let companyId: string;
let otherCompanyId: string;
let adminToken: string;
let userToken: string;
let superToken: string;
let attendantId: string;
let queueId: number;
let contactId: number;
let reasonId: number;
let otherReasonId: number;
let saleA: number;
let saleB: number;
let lost: number;

async function login(email: string, password = 'senha123') {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
    return JSON.parse(res.body).access_token as string;
}
function call(token: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) {
    return app.inject({ method, url: `/api/v1${url}`, headers: { authorization: `Bearer ${token}` }, payload });
}
const body = (res: { body: string }) => JSON.parse(res.body);

beforeAll(async () => {
    await app.ready();
    await runSeed();
    const tags = await db.select({ id: profiles.id, tag: profiles.tag }).from(profiles);
    const profileId = (tag: string) => tags.find((p) => p.tag === tag)!.id;

    const [co] = await db.insert(companies).values({ name: `Empresa CRM ${SUFFIX}`, status: true }).returning({ id: companies.id });
    companyId = co.id;
    const [other] = await db.insert(companies).values({ name: `Empresa CRM Outra ${SUFFIX}`, status: true }).returning({ id: companies.id });
    otherCompanyId = other.id;

    const person = (name: string, tag: string) => ({
        name, email: `crm-${name}-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
        profile_id: profileId(tag), company_id: companyId, email_verified: true, is_approved: true,
    });
    const [, attendant] = await db.insert(users).values([person('admin', 'admin'), person('atendente', 'user')]).returning({ id: users.id });
    attendantId = attendant.id;

    const [q] = await db.insert(queues).values({ company_id: companyId, name: 'Vendas' }).returning({ id: queues.id });
    queueId = q.id;
    const [ct] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente CRM', number: '5511955554444' }).returning({ id: contacts.id });
    contactId = ct.id;
    const [r] = await db.insert(crm_sales_reasons).values({ company_id: companyId, reason: 'Preço alto', color: '#f00' }).returning({ id: crm_sales_reasons.id });
    reasonId = r.id;
    const [or] = await db.insert(crm_sales_reasons).values({ company_id: otherCompanyId, reason: 'Segredo da outra' }).returning({ id: crm_sales_reasons.id });
    otherReasonId = or.id;

    const closed = { company_id: companyId, contact_id: contactId, status_id: 3 };
    const rows = await db.insert(tickets).values([
        { ...closed, is_sale: 1, sale_price: '1.500,00', origin: 'Instagram', attendant_user_id: attendantId, queue_id: queueId, updated_at: new Date('2030-02-10T12:00:00Z') },
        { ...closed, is_sale: 1, sale_price: '500,50', origin: 'Site', updated_at: new Date('2030-02-20T12:00:00Z') },
        { ...closed, is_sale: 0, service_not_made: 1, reasons_id: reasonId, origin: 'Instagram', updated_at: new Date('2030-02-15T12:00:00Z') },
        { company_id: companyId, contact_id: contactId, status_id: 2, is_sale: 1, sale_price: '9.999,00' }, // aberto: fora dos relatórios
    ]).returning({ id: tickets.id });
    [saleA, saleB, lost] = rows.map((t) => t.id);

    adminToken = await login(`crm-admin-${SUFFIX}@test.com`);
    userToken = await login(`crm-atendente-${SUFFIX}@test.com`);
    superToken = await login('filipe@kelmor.com', 'kelmor123');
});

afterAll(async () => { await app.close(); });

describe('Motivos de não venda', () => {
    it('lista os da empresa, por ordem de criação', async () => {
        const list = body(await call(userToken, 'GET', '/crm/reasons')) as { id: number; reason: string }[];
        expect(list.map((r) => r.reason)).toEqual(['Preço alto']);
    });

    it('admin cria (aparado, cor opcional), edita e exclui', async () => {
        const res = await call(adminToken, 'POST', '/crm/reasons', { reason: '  Sem estoque  ' });
        expect(res.statusCode).toBe(201);
        expect(body(res)).toMatchObject({ reason: 'Sem estoque', color: null, company_id: companyId });

        const upd = await call(adminToken, 'PUT', `/crm/reasons/${body(res).id}`, { reason: 'Sem estoque!', color: '#0f0' });
        expect(body(upd)).toMatchObject({ reason: 'Sem estoque!', color: '#0f0' });

        expect(body(await call(adminToken, 'DELETE', `/crm/reasons/${body(res).id}`))).toEqual({ ok: true });
        expect((body(await call(adminToken, 'GET', '/crm/reasons')) as { id: number }[]).map((r) => r.id)).not.toContain(body(res).id);
    });

    it('sem motivo → 400; motivo de outra empresa → 404', async () => {
        const res = await call(adminToken, 'POST', '/crm/reasons', { reason: '  ' });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('Motivo obrigatório');
        const other = await call(adminToken, 'PUT', `/crm/reasons/${otherReasonId}`, { reason: 'Invasão' });
        expect(other.statusCode).toBe(404);
        expect((await db.select().from(crm_sales_reasons).where(eq(crm_sales_reasons.id, otherReasonId)))[0].reason).toBe('Segredo da outra');
    });
});

describe('Palavras-chave de origem', () => {
    it('admin cadastra (palavra em minúsculas) e a mensagem do cliente identifica a origem', async () => {
        const res = await call(adminToken, 'POST', '/crm/keywords', { keyword: '  Vim Do INSTAGRAM ', origin: ' Instagram ' });
        expect(res.statusCode).toBe(201);
        expect(body(res)).toMatchObject({ keyword: 'vim do instagram', origin: 'Instagram' });

        expect(await matchKeywordOrigin(companyId, 'Oi! VIM DO INSTAGRAM, quero preço')).toBe('Instagram');
        expect(await matchKeywordOrigin(companyId, 'bom dia')).toBeNull();
        expect(await matchKeywordOrigin(otherCompanyId, 'vim do instagram')).toBeNull();

        expect((body(await call(userToken, 'GET', '/crm/keywords')) as { origin: string }[]).map((k) => k.origin)).toContain('Instagram');
        expect(body(await call(adminToken, 'DELETE', `/crm/keywords/${body(res).id}`))).toEqual({ ok: true });
    });

    it('sem palavra ou sem origem → 400', async () => {
        const res = await call(adminToken, 'POST', '/crm/keywords', { keyword: 'x' });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('Palavra-chave e origem obrigatórias');
    });
});

describe('Relatórios de venda (só admin)', () => {
    it('atendente → 403', async () => {
        expect((await call(userToken, 'GET', '/crm-reports/sales-made')).statusCode).toBe(403);
    });

    it('vendas feitas: só tickets finalizados com venda, com contato/atendente/fila e totais', async () => {
        const res = body(await call(adminToken, 'GET', '/crm-reports/sales-made'));
        expect(res.salesMade.map((s: { id: number }) => s.id)).toEqual([saleB, saleA]); // mais recente primeiro
        expect(res).toMatchObject({ count: 2, page: 1, totalPages: 1, totalValue: 2000.5, avgValue: 1000.25 });
        expect(res.salesMade[1]).toMatchObject({
            sale_price: '1.500,00', origin: 'Instagram', contact: { name: 'Cliente CRM', number: '5511955554444' },
            attendant_user: { name: 'atendente' }, queue: { name: 'Vendas' }, sale_reason: null,
        });
    });

    it('filtros: período (pela última atualização), atendente, fila e paginação', async () => {
        const period = body(await call(adminToken, 'GET', '/crm-reports/sales-made?dateInit=2030-02-01&dateEnd=2030-02-15'));
        expect(period.salesMade.map((s: { id: number }) => s.id)).toEqual([saleA]);
        expect(body(await call(adminToken, 'GET', `/crm-reports/sales-made?userId=${attendantId}`)).count).toBe(1);
        expect(body(await call(adminToken, 'GET', `/crm-reports/sales-made?queueId=${queueId}`)).count).toBe(1);
        const paged = body(await call(adminToken, 'GET', '/crm-reports/sales-made?perPage=1&page=2'));
        expect(paged).toMatchObject({ page: 2, totalPages: 2 });
        expect(paged.salesMade.map((s: { id: number }) => s.id)).toEqual([saleA]);
    });

    it('vendas não feitas: com o motivo; totais zerados', async () => {
        const res = body(await call(adminToken, 'GET', '/crm-reports/sales-not-made'));
        expect(res.salesMade.map((s: { id: number }) => s.id)).toEqual([lost]);
        expect(res.salesMade[0].sale_reason).toEqual({ id: reasonId, name: 'Preço alto' });
        expect(res).toMatchObject({ count: 1, totalValue: 0, avgValue: 0 });
    });

    it('seletores: motivos por nome e canais distintos', async () => {
        expect(body(await call(adminToken, 'GET', '/crm-reports/reasons-select'))).toEqual([{ id: reasonId, reason: 'Preço alto', color: '#f00' }]);
        const channels = (body(await call(adminToken, 'GET', '/crm-reports/channels-select')) as { channel: string }[]).map((c) => c.channel).sort();
        expect(channels).toEqual(['Instagram', 'Site']);
    });

    it('editar venda: vira não venda com motivo, e volta a ser venda com valor', async () => {
        const [t] = await db.insert(tickets).values({ company_id: companyId, contact_id: contactId, status_id: 3, is_sale: 1, sale_price: '100,00' }).returning({ id: tickets.id });
        expect(body(await call(adminToken, 'PUT', `/crm-reports/${t.id}`, { isSale: false, reasonId }))).toEqual({ ok: true });
        let [row] = await db.select().from(tickets).where(eq(tickets.id, t.id));
        expect(row).toMatchObject({ is_sale: 0, service_not_made: 1, reasons_id: reasonId });

        await call(adminToken, 'PUT', `/crm-reports/${t.id}`, { isSale: true, salePrice: '250,00' });
        [row] = await db.select().from(tickets).where(eq(tickets.id, t.id));
        expect(row).toMatchObject({ is_sale: 1, service_not_made: 0, sale_price: '250,00', reasons_id: null });
    });

    it('editar venda de outra empresa → 404', async () => {
        const [t] = await db.insert(tickets).values({ company_id: otherCompanyId, contact_id: contactId, status_id: 3 }).returning({ id: tickets.id });
        const res = await call(adminToken, 'PUT', `/crm-reports/${t.id}`, { isSale: true, salePrice: '1,00' });
        expect(res.statusCode).toBe(404);
        expect(body(res).error).toBe('Ticket não encontrado');
    });
});

describe('Correções da refatoração', () => {
    it('atendente não cadastra, edita nem exclui motivos e palavras-chave (antes: qualquer usuário)', async () => {
        expect((await call(userToken, 'POST', '/crm/reasons', { reason: 'X' })).statusCode).toBe(403);
        expect((await call(userToken, 'PUT', `/crm/reasons/${reasonId}`, { reason: 'X' })).statusCode).toBe(403);
        expect((await call(userToken, 'DELETE', `/crm/reasons/${reasonId}`)).statusCode).toBe(403);
        expect((await call(userToken, 'POST', '/crm/keywords', { keyword: 'x', origin: 'y' })).statusCode).toBe(403);
    });

    it('editar só a cor mantém o motivo (antes: 500); motivo vazio na edição → 400', async () => {
        const res = await call(adminToken, 'PUT', `/crm/reasons/${reasonId}`, { color: '#00f' });
        expect(body(res)).toMatchObject({ reason: 'Preço alto', color: '#00f' });
        expect((await call(adminToken, 'PUT', `/crm/reasons/${reasonId}`, { reason: ' ' })).statusCode).toBe(400);
    });

    it('venda com motivo de outra empresa → 400 (antes: o relatório mostrava o motivo alheio)', async () => {
        const res = await call(adminToken, 'PUT', `/crm-reports/${lost}`, { isSale: false, reasonId: otherReasonId });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('Motivo não encontrado');
    });

    it('valor fora do formato brasileiro → 400 (antes: "150.50" virava R$ 15.050)', async () => {
        const res = await call(adminToken, 'PUT', `/crm-reports/${saleB}`, { isSale: true, salePrice: '150.50' });
        expect(res.statusCode).toBe(400);
        expect(body(res).error).toBe('Valor inválido. Use o formato 1.500,00');
        expect((await call(adminToken, 'PUT', `/crm-reports/${saleB}`, { isSale: true, salePrice: '150' })).statusCode).toBe(200);
        await call(adminToken, 'PUT', `/crm-reports/${saleB}`, { isSale: true, salePrice: '500,50' });
    });

    it('isSale que não é booleano → 400 (antes: "false" contava como venda)', async () => {
        const res = await call(adminToken, 'PUT', `/crm-reports/${saleB}`, { isSale: 'false' });
        expect(res.statusCode).toBe(400);
    });

    it('id, data e paginação malformados → 400 ou padrão (antes: 500)', async () => {
        expect(body(await call(adminToken, 'PUT', '/crm/reasons/abc', { reason: 'x' })).error).toBe('id inválido');
        expect(body(await call(adminToken, 'PUT', '/crm-reports/abc', { isSale: true })).error).toBe('ticketId inválido');
        expect(body(await call(userToken, 'GET', '/crm/contacts/abc/timeline')).error).toBe('contactId inválido');
        expect(body(await call(adminToken, 'GET', '/crm-reports/sales-made?dateInit=ontem')).error).toBe('dateInit deve estar no formato AAAA-MM-DD');
        expect((await call(adminToken, 'GET', '/crm-reports/sales-made?page=x&perPage=y')).statusCode).toBe(200);
    });

    it('superAdmin (sem empresa) → 403 "Empresa não encontrada"', async () => {
        const res = await call(superToken, 'POST', '/crm/reasons', { reason: 'X' });
        expect(res.statusCode).toBe(403);
        expect(body(res).error).toBe('Empresa não encontrada');
    });
});
