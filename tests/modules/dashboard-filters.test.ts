import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets, connections, queues } from '../../src/modules/atendimento/atendimento.db.schema';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let contactId: number;
let adminUserId: string;
let attendantAId: string;
let attendantBId: string;
let connAId: number;
let connBId: number;
let queueAId: number;
let queueBId: number;

const app = buildApp();
let adminToken: string;
let attendantAToken: string;

async function login(label: string) {
    const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: `dash-filter-${label}-${SUFFIX}@test.com`, password: 'senha123' },
    });
    return JSON.parse(res.body).access_token;
}

beforeAll(async () => {
    await app.ready();

    const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
    const [userProfile]  = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));

    const [co] = await db.insert(companies)
        .values({ name: `Empresa DashFilter ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    async function makeUser(label: string, profileId: number) {
        const [u] = await db.insert(users).values({
            name: label, email: `dash-filter-${label}-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profileId, company_id: companyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        return u.id;
    }
    adminUserId    = await makeUser('admin', adminProfile.id);
    attendantAId   = await makeUser('attendantA', userProfile.id);
    attendantBId   = await makeUser('attendantB', userProfile.id);

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: `Contato DashFilter ${SUFFIX}` })
        .returning({ id: contacts.id });
    contactId = ct.id;

    const [connA] = await db.insert(connections).values({ company_id: companyId, name: 'Conexão A' }).returning({ id: connections.id });
    connAId = connA.id;
    const [connB] = await db.insert(connections).values({ company_id: companyId, name: 'Conexão B' }).returning({ id: connections.id });
    connBId = connB.id;

    const [qA] = await db.insert(queues).values({ company_id: companyId, name: 'Fila A' }).returning({ id: queues.id });
    queueAId = qA.id;
    const [qB] = await db.insert(queues).values({ company_id: companyId, name: 'Fila B' }).returning({ id: queues.id });
    queueBId = qB.id;

    // Ticket do attendantA: conexão A, fila A
    await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, status_id: 2,
        attendant_user_id: attendantAId, connection_id: connAId, queue_id: queueAId,
    });
    // Ticket do attendantB: conexão B, fila B
    await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, status_id: 2,
        attendant_user_id: attendantBId, connection_id: connBId, queue_id: queueBId,
    });

    adminToken      = await login('admin');
    attendantAToken = await login('attendantA');
});

describe('GET /dashboard/kpis — filtro por conexão/fila/atendente', () => {
    it('admin sem filtro vê os dois tickets', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/dashboard/kpis',
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).novasConversasTotal).toBe(2);
    });

    it('admin filtrando por connectionId vê só o ticket daquela conexão', async () => {
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/dashboard/kpis?connectionId=${connAId}`,
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).novasConversasTotal).toBe(1);
    });

    it('admin filtrando por queueId vê só o ticket daquela fila', async () => {
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/dashboard/kpis?queueId=${queueBId}`,
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).novasConversasTotal).toBe(1);
    });

    it('admin filtrando por attendantUserId vê só o ticket daquele atendente', async () => {
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/dashboard/kpis?attendantUserId=${attendantAId}`,
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).novasConversasTotal).toBe(1);
    });

    it('atendente comum sem filtro já vem travado nos próprios tickets', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/dashboard/kpis',
            headers: { authorization: `Bearer ${attendantAToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).novasConversasTotal).toBe(1);
    });

    it('atendente comum não consegue ver os números de outro atendente via query', async () => {
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/dashboard/kpis?attendantUserId=${attendantBId}`,
            headers: { authorization: `Bearer ${attendantAToken}` },
        });
        expect(res.statusCode).toBe(200);
        // continua vendo só o próprio ticket, ignorando o attendantUserId da query
        expect(JSON.parse(res.body).novasConversasTotal).toBe(1);
    });
});

describe('GET /dashboard/kpis — validação do intervalo de datas exatas', () => {
    it('rejeita intervalo maior que 45 dias', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/dashboard/kpis?startDate=2026-01-01&endDate=2026-03-01',
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toMatch(/45 dias/);
    });

    it('aceita intervalo de exatamente 45 dias', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/dashboard/kpis?startDate=2026-01-01&endDate=2026-02-15',
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
    });

    it('rejeita data final anterior à data inicial', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/dashboard/kpis?startDate=2026-02-01&endDate=2026-01-01',
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(400);
    });
});

describe('GET /dashboard/sales-by-connection — gap de escopo corrigido (atendente só via as próprias vendas)', () => {
    beforeAll(async () => {
        // Venda do attendantA na conexão A
        await db.insert(tickets).values({
            company_id: companyId, contact_id: contactId, status_id: 3,
            attendant_user_id: attendantAId, connection_id: connAId,
            is_sale: 1, service_not_made: 0, sale_price: '100,00',
        });
        // Venda do attendantB na conexão B
        await db.insert(tickets).values({
            company_id: companyId, contact_id: contactId, status_id: 3,
            attendant_user_id: attendantBId, connection_id: connBId,
            is_sale: 1, service_not_made: 0, sale_price: '200,00',
        });
    });

    it('admin vê vendas das duas conexões', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/dashboard/sales-by-connection?period=year',
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toHaveLength(2);
    });

    it('atendente comum só vê a própria venda, mesmo sem passar nenhum filtro', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/dashboard/sales-by-connection?period=year',
            headers: { authorization: `Bearer ${attendantAToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { label: string; total: number }[];
        expect(body).toHaveLength(1);
        expect(body[0].label).toBe('Conexão A');
    });
});
