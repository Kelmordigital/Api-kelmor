import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/** Casos de entrada e acesso das rotas de conquistas (regras de jogo: achievements.test.ts). */

const SUFFIX = Date.now();
const BASE = '/api/v1/achievements';

describe('Conquistas — entrada e acesso', () => {
    const app = buildApp();
    let adminToken: string;
    let superAdminToken: string;

    beforeAll(async () => {
        await app.ready();
        await runSeed();
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
        const [co] = await db.insert(companies)
            .values({ name: `Empresa Conquistas Acesso ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        const email = `conquistas-acesso-${SUFFIX}@test.com`;
        await db.insert(users).values({
            name: 'Admin', email, password_hash: hashSync('senha123', 10),
            profile_id: adminProfile.id, company_id: co.id, email_verified: true, is_approved: true,
        });
        const login = async (e: string, p: string) =>
            JSON.parse((await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: e, password: p } })).body).access_token as string;
        adminToken = await login(email, 'senha123');
        superAdminToken = await login('filipe@kelmor.com', 'kelmor123');
    });

    afterAll(async () => { await app.close(); });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const complete = (payload: unknown, token = adminToken) =>
        app.inject({ method: 'POST', url: `${BASE}/complete`, headers: as(token), payload: payload as object });

    it.each([
        [{},                         'Campo "mission_key" é obrigatório'],
        [{ mission_key: '' },        'Campo "mission_key" é obrigatório'],
        [{ mission_key: 42 },        'Campo "mission_key" é obrigatório'],
        [{ mission_key: 'voar' },    'Chave de missão desconhecida: voar'],
    ])('POST /complete %j → 400', async (payload, message) => {
        const res = await complete(payload);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe(message);
    });

    it('superAdmin (sem empresa) não tem conquistas → 403 (antes: 500)', async () => {
        const res = await app.inject({ method: 'GET', url: `${BASE}/progress`, headers: as(superAdminToken) });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).error).toBe('Empresa não encontrada');
    });
});
