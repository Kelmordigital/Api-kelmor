import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { connections, queues } from '../../src/modules/atendimento/atendimento.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let otherCompanyId: string;
let connectionId: number;
let otherCompanyConnectionId: number;
let queueAId: number;
let queueBId: number;

beforeAll(async () => {
    await runSeed();
    const [profile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'user'));

    const [co] = await db.insert(companies)
        .values({ name: `Empresa ConnQueues ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [otherCo] = await db.insert(companies)
        .values({ name: `Empresa ConnQueues Outra ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    otherCompanyId = otherCo.id;

    await db.insert(users).values({
        name: 'Dono Conexao', email: `connqueues-${SUFFIX}@test.com`,
        password_hash: hashSync('senha123', 10),
        profile_id: profile.id, company_id: companyId,
        email_verified: true, is_approved: true,
    });

    const [conn] = await db.insert(connections)
        .values({ company_id: companyId, name: 'Conexão Teste', status: 'disconnected' })
        .returning({ id: connections.id });
    connectionId = conn.id;

    const [otherConn] = await db.insert(connections)
        .values({ company_id: otherCompanyId, name: 'Conexão Outra Empresa', status: 'disconnected' })
        .returning({ id: connections.id });
    otherCompanyConnectionId = otherConn.id;

    const [qa] = await db.insert(queues)
        .values({ company_id: companyId, name: 'Fila A' })
        .returning({ id: queues.id });
    queueAId = qa.id;
    const [qb] = await db.insert(queues)
        .values({ company_id: companyId, name: 'Fila B', color: '#ff0000' })
        .returning({ id: queues.id });
    queueBId = qb.id;
});

describe('Conexão ↔ Filas', () => {
    const app = buildApp();
    let token: string;

    beforeAll(async () => {
        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `connqueues-${SUFFIX}@test.com`, password: 'senha123' },
        });
        token = JSON.parse(login.body).access_token;
    });

    afterAll(async () => { await app.close(); });

    it('GET /connections retorna queues: [] quando não há vínculo', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/whatsapp/connections',
            headers: { authorization: `Bearer ${token}` },
        });
        const body = JSON.parse(res.body);
        const conn = body.find((c: { id: number }) => c.id === connectionId);
        expect(conn.queues).toEqual([]);
    });

    it('PUT /connections/:id/queues vincula filas e GET passa a refletir', async () => {
        const put = await app.inject({
            method: 'PUT', url: `/api/v1/whatsapp/connections/${connectionId}/queues`,
            headers: { authorization: `Bearer ${token}` },
            payload: { queueIds: [queueAId, queueBId] },
        });
        expect(put.statusCode).toBe(200);

        const res = await app.inject({
            method: 'GET', url: '/api/v1/whatsapp/connections',
            headers: { authorization: `Bearer ${token}` },
        });
        const body = JSON.parse(res.body);
        const conn = body.find((c: { id: number }) => c.id === connectionId);
        expect(conn.queues.map((q: { id: number }) => q.id).sort()).toEqual([queueAId, queueBId].sort());
        expect(conn.queues.find((q: { id: number }) => q.id === queueBId).color).toBe('#ff0000');
    });

    it('PUT substitui os vínculos anteriores (não acumula)', async () => {
        await app.inject({
            method: 'PUT', url: `/api/v1/whatsapp/connections/${connectionId}/queues`,
            headers: { authorization: `Bearer ${token}` },
            payload: { queueIds: [queueAId] },
        });

        const res = await app.inject({
            method: 'GET', url: '/api/v1/whatsapp/connections',
            headers: { authorization: `Bearer ${token}` },
        });
        const body = JSON.parse(res.body);
        const conn = body.find((c: { id: number }) => c.id === connectionId);
        expect(conn.queues.map((q: { id: number }) => q.id)).toEqual([queueAId]);
    });

    it('404 ao tentar vincular filas a uma conexão de outra empresa', async () => {
        const res = await app.inject({
            method: 'PUT', url: `/api/v1/whatsapp/connections/${otherCompanyConnectionId}/queues`,
            headers: { authorization: `Bearer ${token}` },
            payload: { queueIds: [queueAId] },
        });
        expect(res.statusCode).toBe(404);
    });
});
