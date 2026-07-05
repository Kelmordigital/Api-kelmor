import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/shared/server';
import { runSeed } from '../../src/database/seed';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { companies } from '../../src/modules/companies/company.db.schema';

/**
 * Módulo superadmin — rotas exclusivas do dono do sistema.
 * Usa o superAdmin do seed (filipe@kelmor.com) e o admin de empresa do seed
 * (dono@kelmor.com) para os testes de autorização.
 */

const app = buildApp();
export const SUFFIX = Date.now();

let superToken: string;
let adminToken: string;

async function login(email: string, password: string): Promise<string> {
    const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email, password },
    });
    return JSON.parse(res.body).access_token;
}

function get(url: string, token?: string) {
    return app.inject({
        method: 'GET', url: `/api/v1/superadmin${url}`,
        headers: token ? { authorization: `Bearer ${token}` } : {},
    });
}

beforeAll(async () => {
    await app.ready();
    await runSeed();
    superToken = await login('filipe@kelmor.com', 'kelmor123');
    adminToken = await login('dono@kelmor.com', 'kelmor123');
});

afterAll(async () => { await app.close(); });

describe('Autorização das rotas /superadmin', () => {
    it('sem token → 401', async () => {
        const res = await get('/stats');
        expect(res.statusCode).toBe(401);
    });

    it('token de admin de empresa → 403', async () => {
        const res = await get('/stats', adminToken);
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).message).toBe('Acesso exclusivo para o administrador do sistema.');
    });
});

describe('GET /superadmin/stats', () => {
    it('retorna os 4 contadores coerentes', async () => {
        const res = await get('/stats', superToken);
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.total).toBeGreaterThanOrEqual(1); // Kelmor Teste do seed
        expect(body.total).toBe(body.ativas + body.inativas);
        expect(body.pendentes).toBeGreaterThanOrEqual(0);
    });
});

describe('GET /superadmin/companies', () => {
    it('lista empresas com admin, contagem e situação derivada', async () => {
        const res = await get('/companies', superToken);
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(Array.isArray(body)).toBe(true);
        const kelmor = body.find((c: { name: string }) => c.name === 'Kelmor Teste');
        expect(kelmor).toBeTruthy();
        expect(kelmor.users_count).toBeGreaterThanOrEqual(2); // dono + atendente do seed
        expect(kelmor.admin.email).toBe('dono@kelmor.com');
        expect(kelmor.admin.is_approved).toBe(true);
        expect(kelmor.situacao).toBe('ATIVA'); // status true + admin aprovado
    });

    it('lista a equipe completa (users) com perfil e aprovação, admins primeiro', async () => {
        const res = await get('/companies', superToken);
        const kelmor = JSON.parse(res.body).find((c: { name: string }) => c.name === 'Kelmor Teste');
        expect(Array.isArray(kelmor.users)).toBe(true);
        expect(kelmor.users.length).toBe(kelmor.users_count);
        const atendente = kelmor.users.find((u: { email: string }) => u.email === 'user@kelmor.com');
        expect(atendente).toBeTruthy();
        expect(atendente.profile_tag).toBe('user');
        expect(typeof atendente.is_approved).toBe('boolean');
        expect(kelmor.users[0].profile_tag).toBe('admin'); // admins vêm primeiro
    });

    it('com dois admins na mesma empresa, "o admin" é o mais antigo (tie-break por id)', async () => {
        const [adminProfile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'admin'));
        const [co] = await db.insert(companies)
            .values({ name: `Empresa DoisAdmins ${SUFFIX}`, status: true })
            .returning({ id: companies.id });

        const sameInstant = new Date('2026-01-01T00:00:00Z');
        await db.insert(users).values([
            { name: 'Admin B', email: `dois-b-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
              profile_id: adminProfile.id, company_id: co.id, email_verified: true, is_approved: true,
              created_at: sameInstant },
            { name: 'Admin A', email: `dois-a-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
              profile_id: adminProfile.id, company_id: co.id, email_verified: true, is_approved: true,
              created_at: sameInstant },
        ]);

        const res = await get('/companies', superToken);
        const row = JSON.parse(res.body).find((c: { id: string }) => c.id === co.id);
        expect(row.users_count).toBe(2);
        // determinístico: menor id (uuid) entre os dois com o mesmo created_at
        const inserted = await db.select({ id: users.id, email: users.email }).from(users)
            .where(eq(users.company_id, co.id));
        const expected = [...inserted].sort((a, b) => a.id.localeCompare(b.id))[0];
        expect(row.admin.id).toBe(expected.id);
    });
});

function inject(method: 'POST' | 'PATCH', url: string, token: string, payload?: object) {
    return app.inject({
        method, url: `/api/v1/superadmin${url}`,
        headers: { authorization: `Bearer ${token}` },
        payload,
    });
}

describe('POST /superadmin/companies — criar empresa + admin bloqueado', () => {
    const adminEmail = `admin-nova-${SUFFIX}@test.com`;
    let companyId: string;

    it('cria empresa ativa com admin bloqueado (is_approved=false)', async () => {
        const res = await inject('POST', '/companies', superToken, {
            name: `Empresa Nova ${SUFFIX}`,
            cnpj_cpf: '12345678000199',
            admin: { name: 'Admin Nova', email: adminEmail, password: 'senha12345' },
        });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);
        expect(body.company.status).toBe(true);
        expect(body.admin.is_approved).toBe(false);
        companyId = body.company.id;
    });

    it('a empresa aparece na listagem com situação PENDENTE', async () => {
        const res = await get('/companies', superToken);
        const co = JSON.parse(res.body).find((c: { id: string }) => c.id === companyId);
        expect(co.situacao).toBe('PENDENTE');
        expect(co.admin.email).toBe(adminEmail);
    });

    it('o admin bloqueado NÃO consegue logar', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: adminEmail, password: 'senha12345' },
        });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).message).toBe('Sua conta está aguardando aprovação.');
    });

    it('email de admin duplicado → 409', async () => {
        const res = await inject('POST', '/companies', superToken, {
            name: `Empresa Dup ${SUFFIX}`,
            admin: { name: 'Dup', email: adminEmail, password: 'senha12345' },
        });
        expect(res.statusCode).toBe(409);
        expect(JSON.parse(res.body).message).toBe('Email já cadastrado');
    });

    it('PATCH /companies/:id edita nome e cnpj', async () => {
        const res = await inject('PATCH', `/companies/${companyId}`, superToken, {
            name: `Empresa Editada ${SUFFIX}`, cnpj_cpf: '98765432000100',
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.name).toBe(`Empresa Editada ${SUFFIX}`);
        expect(body.cnpj_cpf).toBe('98765432000100');
    });

    it('PATCH /companies/:id/status desativa e o login de qualquer usuário da empresa falha com "Empresa inativa"', async () => {
        const off = await inject('PATCH', `/companies/${companyId}/status`, superToken, { status: false });
        expect(off.statusCode).toBe(200);

        // aprova o admin só para isolar o motivo do bloqueio na empresa inativa
        const list = await get('/companies', superToken);
        const co = JSON.parse(list.body).find((c: { id: string }) => c.id === companyId);
        await inject('PATCH', `/users/${co.admin.id}/approve`, superToken);

        const loginRes = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: adminEmail, password: 'senha12345' },
        });
        expect(loginRes.statusCode).toBe(403);
        expect(JSON.parse(loginRes.body).message).toBe('Empresa inativa');

        // reativa para não interferir nos testes seguintes
        const on = await inject('PATCH', `/companies/${companyId}/status`, superToken, { status: true });
        expect(on.statusCode).toBe(200);
    });

    it('empresa inexistente → 404', async () => {
        const res = await inject('PATCH', '/companies/00000000-0000-0000-0000-000000000000', superToken, { name: 'X' });
        expect(res.statusCode).toBe(404);
    });
});

describe('Approve / Revoke do login do admin', () => {
    const email = `admin-aprovacao-${SUFFIX}@test.com`;
    let adminId: string;

    beforeAll(async () => {
        const res = await inject('POST', '/companies', superToken, {
            name: `Empresa Aprovação ${SUFFIX}`,
            admin: { name: 'Admin Aprovação', email, password: 'senha12345' },
        });
        adminId = JSON.parse(res.body).admin.id;
    });

    it('bloqueado → approve → login passa', async () => {
        const before = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha12345' } });
        expect(before.statusCode).toBe(403);

        const ap = await inject('PATCH', `/users/${adminId}/approve`, superToken);
        expect(ap.statusCode).toBe(200);

        const after = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha12345' } });
        expect(after.statusCode).toBe(200);
    });

    it('revoke → login volta a ser bloqueado', async () => {
        const rv = await inject('PATCH', `/users/${adminId}/revoke`, superToken);
        expect(rv.statusCode).toBe(200);

        const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha12345' } });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).message).toBe('Sua conta está aguardando aprovação.');
    });

    it('revoke no próprio superAdmin → 400', async () => {
        const me = await app.inject({
            method: 'GET', url: '/api/v1/auth/me',
            headers: { authorization: `Bearer ${superToken}` },
        });
        const myId = JSON.parse(me.body).id;
        const res = await inject('PATCH', `/users/${myId}/revoke`, superToken);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).message).toBe('O superAdmin não pode revogar a própria aprovação.');
    });

    it('usuário inexistente → 404', async () => {
        const res = await inject('PATCH', '/users/00000000-0000-0000-0000-000000000000/approve', superToken);
        expect(res.statusCode).toBe(404);
    });
});

describe('Refresh não renova sessão bloqueada (enforcement do revoke/desativar)', () => {
    const email = `admin-refresh-${SUFFIX}@test.com`;
    let adminId: string;

    beforeAll(async () => {
        const res = await inject('POST', '/companies', superToken, {
            name: `Empresa Refresh ${SUFFIX}`,
            admin: { name: 'Admin Refresh', email, password: 'senha12345' },
        });
        adminId = JSON.parse(res.body).admin.id;
        await inject('PATCH', `/users/${adminId}/approve`, superToken);
    });

    it('admin revogado não consegue renovar o token', async () => {
        const loginRes = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email, password: 'senha12345' },
        });
        expect(loginRes.statusCode).toBe(200);
        const cookie = loginRes.cookies.find((c: { name: string }) => c.name === 'refresh_token');
        expect(cookie).toBeTruthy();

        await inject('PATCH', `/users/${adminId}/revoke`, superToken);

        const refreshRes = await app.inject({
            method: 'POST', url: '/api/v1/auth/refresh',
            headers: { cookie: `refresh_token=${cookie!.value}` },
        });
        expect(refreshRes.statusCode).toBe(401);
        expect(JSON.parse(refreshRes.body).message).toBe('Sessão encerrada. Faça login novamente.');
    });
});
