import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { buildApp } from '../../src/shared/server';
import { runSeed } from '../../src/database/seed';
import { db } from '../../src/database/client';
import { users } from '../../src/modules/auth/auth.schema';

/**
 * Painel do superAdmin: formato das respostas (contrato com o front) e as
 * correções da refatoração (e-mail sem diferenciar maiúsculas, sessão
 * encerrada na hora ao revogar/desativar, id malformado).
 */

const app = buildApp();
const SUFFIX = Date.now();
let superToken: string;

async function login(email: string, password: string) {
    return app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
}

function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) {
    return app.inject({
        method, url: `/api/v1/superadmin${url}`,
        headers: { authorization: `Bearer ${superToken}` },
        payload,
    });
}

const me = (token: string) =>
    app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${token}` } });

/** Cria empresa + admin, aprova e devolve o token de uma sessão aberta. */
async function companyWithLoggedAdmin(tag: string) {
    const email = `${tag}-${SUFFIX}@test.com`;
    const created = await call('POST', '/companies', {
        name: `Empresa ${tag} ${SUFFIX}`,
        admin: { name: `Admin ${tag}`, email, password: 'senha12345' },
    });
    const { company, admin } = JSON.parse(created.body);
    await call('PATCH', `/users/${admin.id}/approve`);
    const res = await login(email, 'senha12345');
    return { companyId: company.id as string, adminId: admin.id as string, token: JSON.parse(res.body).access_token as string };
}

beforeAll(async () => {
    await app.ready();
    await runSeed();
    superToken = JSON.parse((await login('filipe@kelmor.com', 'kelmor123')).body).access_token;
});

afterAll(async () => { await app.close(); });

describe('Contrato das respostas', () => {
    it('criar empresa → 201 com company e admin, sem password_hash', async () => {
        const res = await call('POST', '/companies', {
            name: `Empresa Contrato ${SUFFIX}`,
            admin: { name: 'Admin Contrato', email: `contrato-${SUFFIX}@test.com`, password: 'senha12345' },
        });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);
        expect(body.company).toMatchObject({ name: `Empresa Contrato ${SUFFIX}`, cnpj_cpf: null, status: true });
        expect(body.admin).toMatchObject({ email: `contrato-${SUFFIX}@test.com`, is_approved: false, finance: true });
        expect(body.admin.password_hash).toBeUndefined();
    });

    it('aprovar e revogar → mensagem + usuário', async () => {
        const created = await call('POST', '/companies', {
            name: `Empresa Msg ${SUFFIX}`,
            admin: { name: 'Admin Msg', email: `msg-${SUFFIX}@test.com`, password: 'senha12345' },
        });
        const adminId = JSON.parse(created.body).admin.id;

        const ap = JSON.parse((await call('PATCH', `/users/${adminId}/approve`)).body);
        expect(ap.message).toBe('Usuário aprovado com sucesso');
        expect(ap.user).toMatchObject({ id: adminId, is_approved: true });

        const rv = JSON.parse((await call('PATCH', `/users/${adminId}/revoke`)).body);
        expect(rv).toEqual({
            message: 'Aprovação revogada',
            user: { id: adminId, name: 'Admin Msg', email: `msg-${SUFFIX}@test.com`, is_approved: false },
        });
    });

    it('não encontrados → 404 { statusCode, error, message }', async () => {
        const ghost = '00000000-0000-0000-0000-000000000000';
        expect(JSON.parse((await call('PATCH', `/companies/${ghost}`, { name: 'Xy' })).body))
            .toEqual({ statusCode: 404, error: 'Not Found', message: 'Empresa não encontrada' });
        expect(JSON.parse((await call('PATCH', `/companies/${ghost}/status`, { status: false })).body))
            .toEqual({ statusCode: 404, error: 'Not Found', message: 'Empresa não encontrada' });
        expect(JSON.parse((await call('PATCH', `/users/${ghost}/approve`)).body))
            .toEqual({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
        expect(JSON.parse((await call('PATCH', `/users/${ghost}/revoke`)).body))
            .toEqual({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
    });

    it('dados inválidos → 400', async () => {
        const res = await call('POST', '/companies', { name: 'X', admin: { name: 'Ad', email: 'nao-e-email', password: '123' } });
        expect(res.statusCode).toBe(400);
        expect((await call('PATCH', '/companies/00000000-0000-0000-0000-000000000000/status', { status: 'sim' })).statusCode).toBe(400);
    });
});

describe('Correções da refatoração', () => {
    it('dados inválidos trazem uma mensagem legível (o front mostra `message`)', async () => {
        const res = await call('POST', '/companies', { name: `Empresa ${SUFFIX}`, admin: { name: 'Admin', email: 'nao-e-email', password: 'senha12345' } });
        expect(JSON.parse(res.body)).toEqual({ statusCode: 400, error: 'Bad Request', message: 'E-mail do admin inválido' });
    });

    it('e-mail do admin é guardado em minúsculas e duplicado em outra caixa → 409', async () => {
        const email = `Caixa-${SUFFIX}@Test.com`;
        const res = await call('POST', '/companies', {
            name: `Empresa Caixa ${SUFFIX}`, admin: { name: 'Admin Caixa', email: `  ${email} `, password: 'senha12345' },
        });
        expect(res.statusCode).toBe(201);
        expect(JSON.parse(res.body).admin.email).toBe(email.toLowerCase());

        const dup = await call('POST', '/companies', {
            name: `Empresa Caixa 2 ${SUFFIX}`, admin: { name: 'Admin Dup', email: email.toUpperCase(), password: 'senha12345' },
        });
        expect(dup.statusCode).toBe(409);
        expect(JSON.parse(dup.body)).toEqual({ statusCode: 409, error: 'Conflict', message: 'Email já cadastrado' });
    });

    it('id malformado → 400 "id inválido" (antes: 500)', async () => {
        const invalid = { statusCode: 400, error: 'Bad Request', message: 'id inválido' };
        expect(JSON.parse((await call('PATCH', '/companies/abc', { name: 'Xy' })).body)).toEqual(invalid);
        expect(JSON.parse((await call('PATCH', '/companies/abc/status', { status: true })).body)).toEqual(invalid);
        expect(JSON.parse((await call('PATCH', '/users/abc/approve')).body)).toEqual(invalid);
        expect(JSON.parse((await call('PATCH', '/users/abc/revoke')).body)).toEqual(invalid);
    });

    it('revogar a aprovação encerra a sessão aberta na hora', async () => {
        const { adminId, token } = await companyWithLoggedAdmin('revoga-sessao');
        expect((await me(token)).statusCode).toBe(200);

        await call('PATCH', `/users/${adminId}/revoke`);
        expect((await me(token)).statusCode).toBe(401);
    });

    it('desativar a empresa encerra a sessão de quem está logado nela', async () => {
        const { companyId, token } = await companyWithLoggedAdmin('desativa-sessao');
        expect((await me(token)).statusCode).toBe(200);

        await call('PATCH', `/companies/${companyId}/status`, { status: false });
        expect((await me(token)).statusCode).toBe(401);
        await call('PATCH', `/companies/${companyId}/status`, { status: true });
    });

    it('nome da empresa com espaços é guardado aparado; só espaços → 400', async () => {
        const created = await call('POST', '/companies', {
            name: `  Empresa Apara ${SUFFIX}  `,
            admin: { name: 'Admin Apara', email: `apara-${SUFFIX}@test.com`, password: 'senha12345' },
        });
        const { company } = JSON.parse(created.body);
        expect(company.name).toBe(`Empresa Apara ${SUFFIX}`);
        expect((await call('PATCH', `/companies/${company.id}`, { name: '   ' })).statusCode).toBe(400);

        const [row] = await db.select({ email: users.email }).from(users).where(eq(users.company_id, company.id));
        expect(row.email).toBe(`apara-${SUFFIX}@test.com`);
    });
});
