import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { produtos } from '../../src/modules/produtos/produto.db.schema';
import { buildApp } from '../../src/shared/server';

/** CRUD de produtos (admin) + catálogo no atendimento, com isolamento por empresa. */

const SUFFIX = Date.now();
const BASE = '/api/v1/configuracao/produtos';

describe('Produtos', () => {
    const app = buildApp();
    let companyId: string;
    let adminToken: string;
    let attendantToken: string;
    let otherAdminToken: string;

    beforeAll(async () => {
        await app.ready();
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies)
                .values({ name: `Empresa Produtos ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function makeUserAndLogin(label: string, profileId: number, coId: string) {
            const email = `produtos-${label}-${SUFFIX}@test.com`;
            await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId,
                email_verified: true, is_approved: true,
            });
            const res = await app.inject({
                method: 'POST', url: '/api/v1/auth/login',
                payload: { email, password: 'senha123' },
            });
            return JSON.parse(res.body).access_token as string;
        }

        companyId = await makeCompany('A');
        const otherCompanyId = await makeCompany('B');
        adminToken = await makeUserAndLogin('admin', adminProfile.id, companyId);
        attendantToken = await makeUserAndLogin('attendant', userProfile.id, companyId);
        otherAdminToken = await makeUserAndLogin('other-admin', adminProfile.id, otherCompanyId);
    });

    afterAll(async () => { await app.close(); });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });

    async function create(payload: Record<string, unknown>, token = adminToken) {
        return app.inject({ method: 'POST', url: BASE, headers: as(token), payload });
    }

    it('cria produto com defaults (value_type=valor_unico, is_active=true) e value como string', async () => {
        const res = await create({ name: '  Consultoria  ', value: 150.5 });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);
        expect(body).toMatchObject({
            name: 'Consultoria', company_id: companyId,
            value_type: 'valor_unico', value: '150.50', is_active: true,
            short_description: null,
        });
    });

    it('value_type=sem_valor descarta o value informado', async () => {
        const res = await create({ name: 'Brinde', value_type: 'sem_valor', value: 99 });
        expect(res.statusCode).toBe(201);
        expect(JSON.parse(res.body).value).toBeNull();
    });

    it('400 quando name ausente ou só espaços', async () => {
        for (const payload of [{}, { name: '   ' }]) {
            const res = await create(payload);
            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body).error).toBe('name é obrigatório');
        }
    });

    it('400 quando value_type inválido (create e update)', async () => {
        const res = await create({ name: 'X', value_type: 'gratis' });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe('value_type inválido');

        const created = JSON.parse((await create({ name: 'Y' })).body);
        const upd = await app.inject({
            method: 'PUT', url: `${BASE}/${created.id}`, headers: as(adminToken),
            payload: { value_type: 'gratis' },
        });
        expect(upd.statusCode).toBe(400);
        expect(JSON.parse(upd.body).error).toBe('value_type inválido');
    });

    it('lista só os produtos da própria empresa, mais recentes primeiro', async () => {
        const res = await app.inject({ method: 'GET', url: BASE, headers: as(adminToken) });
        expect(res.statusCode).toBe(200);
        const list = JSON.parse(res.body) as Array<{ company_id: string; created_at: string }>;
        expect(list.length).toBeGreaterThanOrEqual(2);
        expect(list.every((p) => p.company_id === companyId)).toBe(true);
        const dates = list.map((p) => new Date(p.created_at).getTime());
        expect([...dates].sort((a, b) => b - a)).toEqual(dates);

        const other = await app.inject({ method: 'GET', url: BASE, headers: as(otherAdminToken) });
        expect(JSON.parse(other.body)).toEqual([]);
    });

    it('findById: 200 na própria empresa, 404 para outra empresa', async () => {
        const created = JSON.parse((await create({ name: 'Detalhe' })).body);
        const own = await app.inject({ method: 'GET', url: `${BASE}/${created.id}`, headers: as(adminToken) });
        expect(own.statusCode).toBe(200);
        expect(JSON.parse(own.body).name).toBe('Detalhe');

        const foreign = await app.inject({ method: 'GET', url: `${BASE}/${created.id}`, headers: as(otherAdminToken) });
        expect(foreign.statusCode).toBe(404);
        expect(JSON.parse(foreign.body).error).toBe('Produto não encontrado');
    });

    it('update: altera campos, converte value, zera value ao virar sem_valor', async () => {
        const created = JSON.parse((await create({ name: 'Plano', value: 10 })).body);
        const upd = await app.inject({
            method: 'PUT', url: `${BASE}/${created.id}`, headers: as(adminToken),
            payload: { name: 'Plano Mensal', value_type: 'recorrente', value: 49.9, is_active: false },
        });
        expect(upd.statusCode).toBe(200);
        expect(JSON.parse(upd.body)).toMatchObject({
            name: 'Plano Mensal', value_type: 'recorrente', value: '49.90', is_active: false,
        });

        const semValor = await app.inject({
            method: 'PUT', url: `${BASE}/${created.id}`, headers: as(adminToken),
            payload: { value_type: 'sem_valor' },
        });
        expect(JSON.parse(semValor.body).value).toBeNull();
    });

    it('update/delete de produto de outra empresa → 404 e não altera nada', async () => {
        const created = JSON.parse((await create({ name: 'Protegido' })).body);
        const upd = await app.inject({
            method: 'PUT', url: `${BASE}/${created.id}`, headers: as(otherAdminToken),
            payload: { name: 'Invadido' },
        });
        expect(upd.statusCode).toBe(404);
        const del = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(otherAdminToken) });
        expect(del.statusCode).toBe(404);

        const [row] = await db.select().from(produtos).where(eq(produtos.id, created.id));
        expect(row.name).toBe('Protegido');
    });

    it('update ignora campos fora do contrato (não move produto de empresa via company_id)', async () => {
        const created = JSON.parse((await create({ name: 'Fixo' })).body);
        const [otherCo] = await db.insert(companies)
            .values({ name: `Empresa Produtos Alvo ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        const upd = await app.inject({
            method: 'PUT', url: `${BASE}/${created.id}`, headers: as(adminToken),
            payload: { name: `Fixo ${SUFFIX}`, company_id: otherCo.id, id: crypto.randomUUID() },
        });
        expect(upd.statusCode).toBe(200);
        const [row] = await db.select().from(produtos).where(eq(produtos.id, created.id));
        expect(row).toMatchObject({ name: `Fixo ${SUFFIX}`, company_id: companyId });
    });

    it('id malformado → 400 (antes estourava 500 no Postgres)', async () => {
        const res = await app.inject({ method: 'GET', url: `${BASE}/nao-e-uuid`, headers: as(adminToken) });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe('id inválido');
    });

    it('delete: 204 e depois 404', async () => {
        const created = JSON.parse((await create({ name: 'Descartável' })).body);
        const del = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(adminToken) });
        expect(del.statusCode).toBe(204);
        const again = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(adminToken) });
        expect(again.statusCode).toBe(404);
    });

    it('atendente não acessa o CRUD (403), mas lê o catálogo no atendimento', async () => {
        const crud = await app.inject({ method: 'GET', url: BASE, headers: as(attendantToken) });
        expect(crud.statusCode).toBe(403);

        const catalog = await app.inject({ method: 'GET', url: '/api/v1/atendimento/produtos', headers: as(attendantToken) });
        expect(catalog.statusCode).toBe(200);
        const list = JSON.parse(catalog.body) as Array<{ company_id: string }>;
        expect(list.length).toBeGreaterThan(0);
        expect(list.every((p) => p.company_id === companyId)).toBe(true);
    });
});
