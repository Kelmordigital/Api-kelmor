import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let contactId: number;

const app = buildApp();
let adminToken: string;

beforeAll(async () => {
    await app.ready();

    const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

    const [co] = await db.insert(companies)
        .values({ name: `Empresa DashGraphStatus ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    await db.insert(users).values({
        name: 'admin', email: `dash-graph-status-${SUFFIX}@test.com`,
        password_hash: hashSync('senha123', 10),
        profile_id: adminProfile.id, company_id: companyId,
        email_verified: true, is_approved: true,
    });

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: `Contato DashGraphStatus ${SUFFIX}` })
        .returning({ id: contacts.id });
    contactId = ct.id;

    // Todos "agora" — cai no mesmo slot de hora, o que já basta pra testar o agrupamento
    // por status_id sem depender de fuso (a coluna created_at é UTC, o relógio local não é).
    const now = new Date();
    await db.insert(tickets).values({ company_id: companyId, contact_id: contactId, status_id: 1, created_at: now });
    await db.insert(tickets).values({ company_id: companyId, contact_id: contactId, status_id: 2, created_at: now });
    await db.insert(tickets).values({ company_id: companyId, contact_id: contactId, status_id: 2, created_at: now });
    await db.insert(tickets).values({ company_id: companyId, contact_id: contactId, status_id: 3, created_at: now });

    const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: `dash-graph-status-${SUFFIX}@test.com`, password: 'senha123' },
    });
    adminToken = JSON.parse(res.body).access_token;
});

describe('GET /dashboard/graph-by-status', () => {
    it('agrupa por status_id corretamente (1 na fila, 2 em atendimento, 1 resolvido)', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/dashboard/graph-by-status?period=day',
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { period: string; data: { slot: number; status_id: number; total: number }[] };
        expect(body.period).toBe('day');

        const sumByStatus = (statusId: number) =>
            body.data.filter(r => r.status_id === statusId).reduce((s, r) => s + r.total, 0);

        expect(sumByStatus(1)).toBe(1);
        expect(sumByStatus(2)).toBe(2);
        expect(sumByStatus(3)).toBe(1);
    });

    it('não mistura tickets de outra empresa', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/dashboard/graph-by-status?period=day',
            headers: { authorization: `Bearer ${adminToken}` },
        });
        const body = JSON.parse(res.body) as { data: { total: number }[] };
        const totalGeral = body.data.reduce((s, r) => s + r.total, 0);
        expect(totalGeral).toBe(4);
    });
});
