import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { buildApp } from '../../src/shared/server';
import { db } from '../../src/database/client';
import { users } from '../../src/modules/auth/auth.schema';
import { companies } from '../../src/modules/companies/company.db.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { runSeed } from '../../src/database/seed';

const app = buildApp();

// Fecha o app uma única vez após todos os describes
afterAll(async () => {
    await app.close();
});

async function getProfileId(tag: string) {
    const [p] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, tag));
    if (!p) throw new Error(`Profile '${tag}' não encontrado. Rode runSeed() antes.`);
    return p.id;
}

describe('Auth — POST /api/v1/auth/login', () => {
    let companyId: string;

    beforeAll(async () => {
        await app.ready();
        await db.delete(users);
        await db.delete(companies);
        await runSeed(); // garante profiles

        const adminId = await getProfileId('admin');
        const userId = await getProfileId('user');

        const [co] = await db.insert(companies)
            .values({ name: 'Empresa Teste', status: true })
            .returning({ id: companies.id });
        companyId = co.id;

        const [inactiveCo] = await db.insert(companies)
            .values({ name: 'Empresa Inativa', status: false })
            .returning({ id: companies.id });

        await db.insert(users).values([
            // usuário válido
            {
                name: 'Admin Válido', email: 'valid@test.com',
                password_hash: hashSync('senha123', 10),
                profile_id: adminId, company_id: companyId,
                email_verified: true, is_approved: true,
            },
            // sem empresa
            {
                name: 'Sem Empresa', email: 'nocompany@test.com',
                password_hash: hashSync('senha123', 10),
                profile_id: userId, company_id: null,
                email_verified: true, is_approved: true,
            },
            // email não verificado
            {
                name: 'Nao Verificado', email: 'unverified@test.com',
                password_hash: hashSync('senha123', 10),
                profile_id: userId, company_id: companyId,
                email_verified: false, is_approved: true,
            },
            // não aprovado
            {
                name: 'Nao Aprovado', email: 'unapproved@test.com',
                password_hash: hashSync('senha123', 10),
                profile_id: userId, company_id: companyId,
                email_verified: true, is_approved: false,
            },
            // empresa inativa
            {
                name: 'Empresa Inativa User', email: 'inactive@test.com',
                password_hash: hashSync('senha123', 10),
                profile_id: userId, company_id: inactiveCo.id,
                email_verified: true, is_approved: true,
            },
        ]);
    });

    it('401 para email inexistente', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'ninguem@test.com', password: 'qualquer' },
        });
        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body).message).toBe('Usuário ou senha inválido');
    });

    it('401 para senha errada', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'valid@test.com', password: 'errada' },
        });
        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body).message).toBe('Usuário ou senha inválido');
    });

    it('403 para email não verificado', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'unverified@test.com', password: 'senha123' },
        });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).message).toBe('Email não verificado');
    });

    it('403 para usuário não aprovado', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'unapproved@test.com', password: 'senha123' },
        });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).message).toBe('Sua conta está aguardando aprovação.');
    });

    it('403 para usuário sem empresa', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'nocompany@test.com', password: 'senha123' },
        });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).message).toBe('Sua conta está indisponível no momento. Entre em contato com o financeiro.');
    });

    it('403 para empresa inativa', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'inactive@test.com', password: 'senha123' },
        });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body).message).toBe('Empresa inativa');
    });

    it('200 para superAdmin sem empresa', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'filipe@kelmor.com', password: 'kelmor123' },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.access_token).toBeTruthy();
        expect(body.user.profile_tag).toBe('superAdmin');
        expect(res.cookies.find((c: { name: string }) => c.name === 'refresh_token')).toBeTruthy();
    });

    it('200 para login válido com empresa ativa', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'valid@test.com', password: 'senha123' },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.access_token).toBeTruthy();
        expect(body.user.company_id).toBe(companyId);
    });
});

describe('Auth — GET /api/v1/auth/me', () => {
    it('401 sem token', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body).message).toBe('Token não fornecido');
    });

    it('401 com token inválido', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/auth/me',
            headers: { authorization: 'Bearer token.invalido.aqui' },
        });
        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body).message).toBe('Token inválido ou expirado');
    });

    it('200 com token válido', async () => {
        const loginRes = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'valid@test.com', password: 'senha123' },
        });
        const { access_token } = JSON.parse(loginRes.body);

        const res = await app.inject({
            method: 'GET', url: '/api/v1/auth/me',
            headers: { authorization: `Bearer ${access_token}` },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).email).toBe('valid@test.com');
    });
});

describe('Auth — POST /api/v1/auth/register', () => {
    it('401 sem x-admin-key', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/register',
            payload: { name: 'Novo', email: 'novo@test.com', password: 'senha123', profile_id: 1 },
        });
        expect(res.statusCode).toBe(401);
    });

    it('409 para email duplicado', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/register',
            headers: { 'x-admin-key': process.env.ADMIN_SECRET ?? '' },
            payload: { name: 'Dup', email: 'valid@test.com', password: 'senha123', profile_id: 1 },
        });
        expect(res.statusCode).toBe(409);
    });

    it('201 cria usuário com is_approved=false por padrão', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/register',
            headers: { 'x-admin-key': process.env.ADMIN_SECRET ?? '' },
            payload: { name: 'Novo User', email: 'newuser@test.com', password: 'senha123', profile_id: 1 },
        });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);
        expect(body.is_approved).toBe(false);
        expect(body.email).toBe('newuser@test.com');
    });
});

describe('Auth — PATCH /api/v1/auth/approve/:id', () => {
    let superAdminToken: string;
    let newUserId: string;

    beforeAll(async () => {
        const loginRes = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'filipe@kelmor.com', password: 'kelmor123' },
        });
        superAdminToken = JSON.parse(loginRes.body).access_token;

        const regRes = await app.inject({
            method: 'POST', url: '/api/v1/auth/register',
            headers: { 'x-admin-key': process.env.ADMIN_SECRET ?? '' },
            payload: { name: 'Para Aprovar', email: 'toapprove@test.com', password: 'senha123', profile_id: 1 },
        });
        newUserId = JSON.parse(regRes.body).id;
    });

    it('403 para não-superAdmin', async () => {
        const loginRes = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'valid@test.com', password: 'senha123' },
        });
        const token = JSON.parse(loginRes.body).access_token;

        const res = await app.inject({
            method: 'PATCH', url: `/api/v1/auth/approve/${newUserId}`,
            headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(403);
    });

    it('200 superAdmin aprova usuário', async () => {
        const res = await app.inject({
            method: 'PATCH', url: `/api/v1/auth/approve/${newUserId}`,
            headers: { authorization: `Bearer ${superAdminToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).user.is_approved).toBe(true);
    });
});

describe('Auth — POST /api/v1/auth/refresh', () => {
    it('401 sem cookie refresh_token', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body).message).toBe('Refresh token não fornecido');
    });

    it('401 com token inválido', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/refresh',
            cookies: { refresh_token: 'token.invalido' },
        });
        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body).message).toBe('Refresh token inválido ou expirado');
    });

    it('200 renova access token com cookie válido', async () => {
        const loginRes = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'valid@test.com', password: 'senha123' },
        });
        const cookie = loginRes.cookies.find((c: { name: string }) => c.name === 'refresh_token');

        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/refresh',
            cookies: { refresh_token: cookie!.value },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).access_token).toBeTruthy();
    });
});

describe('Auth — DELETE /api/v1/auth/logout', () => {
    it('200 faz logout e limpa cookie', async () => {
        const loginRes = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: 'valid@test.com', password: 'senha123' },
        });
        const cookie = loginRes.cookies.find((c: { name: string }) => c.name === 'refresh_token');

        const res = await app.inject({
            method: 'DELETE', url: '/api/v1/auth/logout',
            cookies: { refresh_token: cookie!.value },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).message).toBe('Logout realizado com sucesso');
    });
});
