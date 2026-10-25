import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { buildApp } from '../../src/shared/server';
import { db } from '../../src/database/client';
import { users } from '../../src/modules/auth/auth.schema';
import { companies } from '../../src/modules/companies/company.db.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { env } from '../../src/config/env';

/** Login com e-mail em qualquer caixa, logout que encerra a sessão e cadastro consistente. */

const SUFFIX = Date.now();

describe('Auth — sessão e e-mail', () => {
    const app = buildApp();
    let companyId: string;
    let userProfileId: number;
    const email = `sessao-${SUFFIX}@test.com`;

    beforeAll(async () => {
        await app.ready();
        const [p] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        userProfileId = p.id;
        const [co] = await db.insert(companies).values({ name: `Empresa Sessão ${SUFFIX}`, status: true }).returning({ id: companies.id });
        companyId = co.id;
        await db.insert(users).values({
            name: 'Sessão', email, password_hash: hashSync('senha123', 10),
            profile_id: userProfileId, company_id: companyId, email_verified: true, is_approved: true,
        });
    });

    afterAll(async () => { await app.close(); });

    const login = (e: string, password = 'senha123') =>
        app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: e, password } });
    const me = (token: string) => app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` } });
    const refreshCookie = (res: { cookies: { name: string; value: string }[] }) => res.cookies.find((c) => c.name === 'refresh_token')!.value;

    it('entra com o e-mail em maiúsculas e com espaços', async () => {
        const res = await login(`  ${email.toUpperCase()}  `);
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).user.email).toBe(email);
    });

    it('logout encerra a sessão: o access token deixa de valer na hora', async () => {
        const res = await login(email);
        const token = JSON.parse(res.body).access_token;
        expect((await me(token)).statusCode).toBe(200);

        const out = await app.inject({ method: 'DELETE', url: '/api/v1/auth/logout', cookies: { refresh_token: refreshCookie(res) } });
        expect(out.statusCode).toBe(200);
        expect(JSON.parse(out.body)).toEqual({ message: 'Logout realizado com sucesso' });

        expect((await me(token)).statusCode).toBe(401);
        const again = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', cookies: { refresh_token: refreshCookie(res) } });
        expect(again.statusCode).toBe(401);
    });

    it('cadastro guarda o e-mail em minúsculas e recusa repetido em outra caixa', async () => {
        const newEmail = `Cadastro-${SUFFIX}@Test.com`;
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/register', headers: { 'x-admin-key': env.ADMIN_SECRET },
            payload: { name: 'Novo', email: newEmail, password: 'senha12345', profile_id: userProfileId, company_id: companyId },
        });
        expect(res.statusCode).toBe(201);
        expect(JSON.parse(res.body).email).toBe(newEmail.toLowerCase());

        const dup = await app.inject({
            method: 'POST', url: '/api/v1/auth/register', headers: { 'x-admin-key': env.ADMIN_SECRET },
            payload: { name: 'Dup', email: newEmail.toUpperCase(), password: 'senha12345', profile_id: userProfileId, company_id: companyId },
        });
        expect(dup.statusCode).toBe(409);
        expect(JSON.parse(dup.body)).toEqual({ statusCode: 409, error: 'Conflict', message: 'Email já cadastrado' });
    });

    it('cadastro com empresa inexistente → 400 (antes: 500)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/auth/register', headers: { 'x-admin-key': env.ADMIN_SECRET },
            payload: { name: 'Sem empresa', email: `sem-empresa-${SUFFIX}@test.com`, password: 'senha12345', profile_id: userProfileId, company_id: randomUUID() },
        });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body)).toEqual({ statusCode: 400, error: 'Bad Request', message: 'Empresa não encontrada' });
    });

    it('erros do login mantêm o formato { statusCode, error, message }', async () => {
        const res = await login(email, 'errada');
        expect(JSON.parse(res.body)).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Usuário ou senha inválido' });
    });
});
