import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { companyIntegrations } from '../../src/modules/integracoes/integracao.db.schema';
import { verifyOAuthStateTicket } from '../../src/config/jwt';
import { env } from '../../src/config/env';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/**
 * Integração Google Calendar pela API: URL de autorização, callback (sem
 * chegar a chamar o Google), status e desconexão. A troca do code pelos
 * tokens é coberta em tests/unit/google-calendar-integration.test.ts.
 */

const SUFFIX = Date.now();
const BASE = '/api/v1/integracoes/google';
const REDIRECT = `${env.FRONTEND_URL}/dashboard/configuracoes/integracoes`;

describe('Integrações — Google Calendar', () => {
    const app = buildApp();
    let companyId: string;
    let otherCompanyId: string;
    let adminToken: string;
    let attendantToken: string;
    let otherAdminToken: string;
    let superAdminToken: string;

    beforeAll(async () => {
        await app.ready();
        await runSeed();
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies)
                .values({ name: `Empresa Integracoes ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function login(email: string, password: string) {
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
            return JSON.parse(res.body).access_token as string;
        }
        async function makeUserAndLogin(label: string, profileId: number, coId: string) {
            const email = `integracoes-${label}-${SUFFIX}@test.com`;
            await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId,
                email_verified: true, is_approved: true,
            });
            return login(email, 'senha123');
        }

        companyId = await makeCompany('A');
        otherCompanyId = await makeCompany('B');
        adminToken = await makeUserAndLogin('admin', adminProfile.id, companyId);
        attendantToken = await makeUserAndLogin('attendant', userProfile.id, companyId);
        otherAdminToken = await makeUserAndLogin('other-admin', adminProfile.id, otherCompanyId);
        superAdminToken = await login('filipe@kelmor.com', 'kelmor123');
    });

    afterAll(async () => { await app.close(); });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const get = (url: string, token?: string) =>
        app.inject({ method: 'GET', url, headers: token ? as(token) : {} });
    const connect = (coId: string, email: string) =>
        db.insert(companyIntegrations).values({
            company_id: coId, provider: 'google_calendar',
            access_token: 'at', refresh_token: 'rt', google_email: email,
            token_expiry: new Date(Date.now() + 3600_000),
        });

    describe('URL de autorização', () => {
        it('admin recebe URL do Google com state assinado para a própria empresa', async () => {
            const res = await get(`${BASE}/auth-url`, adminToken);
            expect(res.statusCode).toBe(200);
            const url = new URL(JSON.parse(res.body).url);
            expect(url.hostname).toBe('accounts.google.com');
            expect(url.searchParams.get('access_type')).toBe('offline');
            expect(url.searchParams.get('prompt')).toBe('consent');
            expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar');
            expect(verifyOAuthStateTicket(url.searchParams.get('state')!)).toEqual({ companyId });
        });

        it('superAdmin (sem empresa) → 403', async () => {
            const res = await get(`${BASE}/auth-url`, superAdminToken);
            expect(res.statusCode).toBe(403);
            expect(JSON.parse(res.body).error).toBe('Empresa não encontrada');
        });

        it('atendente → 403; sem login → 401', async () => {
            expect((await get(`${BASE}/auth-url`, attendantToken)).statusCode).toBe(403);
            expect((await get(`${BASE}/auth-url`)).statusCode).toBe(401);
        });
    });

    describe('callback do Google (público)', () => {
        const callback = (query: string) => get(`${BASE}/callback${query}`);

        it('sem code/state → volta ao front com error=missing_params', async () => {
            const res = await callback('?code=abc');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe(`${REDIRECT}?error=missing_params`);
        });

        it('state inválido ou forjado → error=invalid_state, sem tocar no banco', async () => {
            const res = await callback(`?code=abc&state=${companyId}`);
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe(`${REDIRECT}?error=invalid_state`);
            const rows = await db.select().from(companyIntegrations).where(eq(companyIntegrations.company_id, companyId));
            expect(rows).toHaveLength(0);
        });

        it('usuário cancelou no Google (error=access_denied) → error=access_denied', async () => {
            const res = await callback('?error=access_denied&state=x');
            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe(`${REDIRECT}?error=access_denied`);
        });
    });

    describe('status e desconexão', () => {
        it('sem integração → { connected: false }', async () => {
            const res = await get(`${BASE}/status`, adminToken);
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ connected: false, needs_reconnect: false });
        });

        it('com integração → conectado com o e-mail da conta Google', async () => {
            await connect(companyId, 'agenda@empresa-a.com');
            const res = await get(`${BASE}/status`, adminToken);
            expect(JSON.parse(res.body)).toEqual({ connected: true, email: 'agenda@empresa-a.com', needs_reconnect: false });
            expect(JSON.parse((await get(`${BASE}/status`, otherAdminToken)).body)).toEqual({ connected: false, needs_reconnect: false });
        });

        it('Google recusou os tokens → status avisa que precisa reconectar', async () => {
            await db.update(companyIntegrations)
                .set({ reconnect_required_at: new Date() })
                .where(eq(companyIntegrations.company_id, companyId));
            const res = await get(`${BASE}/status`, adminToken);
            expect(JSON.parse(res.body)).toEqual({ connected: true, email: 'agenda@empresa-a.com', needs_reconnect: true });
        });

        it('desconectar apaga só a integração da própria empresa (204, idempotente)', async () => {
            await connect(otherCompanyId, 'agenda@empresa-b.com');
            const del = await app.inject({ method: 'DELETE', url: BASE, headers: as(adminToken) });
            expect(del.statusCode).toBe(204);
            expect(JSON.parse((await get(`${BASE}/status`, adminToken)).body)).toEqual({ connected: false, needs_reconnect: false });
            expect(JSON.parse((await get(`${BASE}/status`, otherAdminToken)).body).connected).toBe(true);

            const again = await app.inject({ method: 'DELETE', url: BASE, headers: as(adminToken) });
            expect(again.statusCode).toBe(204);
        });

        it('atendente não vê status nem desconecta (403)', async () => {
            expect((await get(`${BASE}/status`, attendantToken)).statusCode).toBe(403);
            const del = await app.inject({ method: 'DELETE', url: BASE, headers: as(attendantToken) });
            expect(del.statusCode).toBe(403);
        });
    });
});
