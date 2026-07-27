import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { connections } from '../../src/modules/atendimento/atendimento.db.schema';
import { whatsappService } from '../../src/modules/whatsapp/whatsapp.service';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let token: string;
let connAId: number;
let connBId: number;

describe('GET /whatsapp/status — empresa com múltiplas conexões', () => {
    const app = buildApp();

    beforeAll(async () => {
        await app.ready();
        const [profile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'user'));

        const [co] = await db.insert(companies)
            .values({ name: `Empresa StatusMulti ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;

        await db.insert(users).values({
            name: 'multi', email: `whats-status-multi-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: companyId,
            email_verified: true, is_approved: true,
        });

        const [connA] = await db.insert(connections)
            .values({ company_id: companyId, name: 'Conexão A' })
            .returning({ id: connections.id });
        connAId = connA.id;
        const [connB] = await db.insert(connections)
            .values({ company_id: companyId, name: 'Conexão B' })
            .returning({ id: connections.id });
        connBId = connB.id;

        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `whats-status-multi-${SUFFIX}@test.com`, password: 'senha123' },
        });
        token = JSON.parse(login.body).access_token;
    });

    afterEach(() => { vi.restoreAllMocks(); });

    it('retorna "connected" se a PRIMEIRA conexão cadastrada estiver desconectada mas a segunda estiver conectada', async () => {
        vi.spyOn(whatsappService, 'getStatus').mockImplementation(async (id?: number) => {
            if (id === connAId) return { status: 'disconnected' };
            if (id === connBId) return { status: 'connected' };
            return { status: 'disconnected' };
        });

        const res = await app.inject({
            method: 'GET', url: '/api/v1/whatsapp/status',
            headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).status).toBe('connected');
    });

    it('retorna "disconnected" quando NENHUMA conexão está conectada', async () => {
        vi.spyOn(whatsappService, 'getStatus').mockResolvedValue({ status: 'disconnected' });

        const res = await app.inject({
            method: 'GET', url: '/api/v1/whatsapp/status',
            headers: { authorization: `Bearer ${token}` },
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).status).toBe('disconnected');
    });
});
