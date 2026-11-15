import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets, crm_sales_reasons } from '../../src/modules/atendimento/atendimento.db.schema';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
const app = buildApp();
let token: string;
let ticketId: number;

function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
    return app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as any });
}

beforeAll(async () => {
    const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
    const [coA] = await db.insert(companies).values({ name: `Rotas A ${SUFFIX}`, status: true }).returning({ id: companies.id });
    const [coB] = await db.insert(companies).values({ name: `Rotas B ${SUFFIX}`, status: true }).returning({ id: companies.id });
    await db.insert(users).values({
        name: 'Atendente Rotas', email: `rotas-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
        profile_id: profile.id, company_id: coA.id, email_verified: true, is_approved: true,
    });
    const [ct] = await db.insert(contacts).values({ company_id: coA.id, name: 'Contato Rotas' }).returning({ id: contacts.id });
    const [t] = await db.insert(tickets).values({ company_id: coA.id, contact_id: ct.id, status_id: 2 }).returning({ id: tickets.id });
    ticketId = t.id;
    await db.insert(crm_sales_reasons).values({ company_id: coA.id, reason: 'Preço' });
    await db.insert(crm_sales_reasons).values({ company_id: coA.id, reason: 'Estoque' });
    await db.insert(crm_sales_reasons).values({ company_id: coB.id, reason: 'De outra empresa' });

    await app.ready();
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: `rotas-${SUFFIX}@test.com`, password: 'senha123' } });
    token = JSON.parse(login.body).access_token;
});

describe('rotas mortas removidas (spec 8.6 e 8.7)', () => {
    it('PATCH /tickets/:id/status não existe mais', async () => {
        expect((await call('PATCH', `/api/v1/atendimento/tickets/${ticketId}/status`, { statusId: 3 })).statusCode).toBe(404);
    });

    it('POST /atendimento/reasons não existe mais', async () => {
        expect((await call('POST', '/api/v1/atendimento/reasons', { reason: 'X' })).statusCode).toBe(404);
    });

    it('GET /atendimento/reasons lista só os motivos da empresa, por id', async () => {
        const res = await call('GET', '/api/v1/atendimento/reasons');
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.map((r: any) => r.reason)).toEqual(['Preço', 'Estoque']);
        expect(Object.keys(body[0]).sort()).toEqual(['color', 'company_id', 'id', 'reason']);
    });
});
