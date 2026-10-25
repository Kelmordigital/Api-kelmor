import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { cupons } from '../../src/modules/cupons/cupom.db.schema';
import { buildApp } from '../../src/shared/server';

/** CRUD de cupons (admin): regras por tipo, código único por empresa, merge no PUT. */

const SUFFIX = Date.now();
const BASE = '/api/v1/configuracao/cupons';
let seq = 0;
const code = () => `c${SUFFIX % 1_000_000}x${++seq}`;

describe('Cupons', () => {
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
                .values({ name: `Empresa Cupons ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function makeUserAndLogin(label: string, profileId: number, coId: string) {
            const email = `cupons-${label}-${SUFFIX}@test.com`;
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
    const create = (payload: Record<string, unknown>, token = adminToken) =>
        app.inject({ method: 'POST', url: BASE, headers: as(token), payload });
    const update = (id: string, payload: Record<string, unknown>, token = adminToken) =>
        app.inject({ method: 'PUT', url: `${BASE}/${id}`, headers: as(token), payload });
    const errorOf = (res: { body: string }) => JSON.parse(res.body).error;

    describe('criação', () => {
        it('defaults: type=percentual, is_public=false, is_active=true; code em maiúsculas e sem espaços', async () => {
            const c = code();
            const res = await create({ code: `  ${c}  `, value: 10 });
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toMatchObject({
                company_id: companyId, code: c.toUpperCase(), type: 'percentual',
                value: '10.00', gift_description: null, min_sale_value: null,
                is_public: false, is_active: true,
            });
        });

        it('fixo: guarda value e min_sale_value como string decimal', async () => {
            const res = await create({ code: code(), type: 'fixo', value: 25.5, min_sale_value: 100, is_public: true });
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toMatchObject({ type: 'fixo', value: '25.50', min_sale_value: '100.00', is_public: true });
        });

        it('brinde: exige gift_description, descarta value', async () => {
            const res = await create({ code: code(), type: 'brinde', value: 50, gift_description: '  Caneca  ' });
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toMatchObject({ type: 'brinde', value: null, gift_description: 'Caneca' });
        });

        it('frete_gratis: não exige value; gift_description é descartada', async () => {
            const res = await create({ code: code(), type: 'frete_gratis', gift_description: 'x' });
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toMatchObject({ type: 'frete_gratis', value: null, gift_description: null });
        });

        it.each([
            [{},                                                   'code é obrigatório'],
            [{ code: '   ' },                                       'code é obrigatório'],
            [{ code: 'A'.repeat(51), value: 10 },                   'code não pode passar de 50 caracteres'],
            [{ code: 'OK', type: 'cashback' },                      'type inválido'],
            [{ code: 'OK' },                                        'value deve ser maior que zero para este tipo de cupom'],
            [{ code: 'OK', type: 'fixo', value: 0 },                'value deve ser maior que zero para este tipo de cupom'],
            [{ code: 'OK', type: 'percentual', value: 0.5 },        'value (percentual) deve estar entre 1 e 100'],
            [{ code: 'OK', type: 'percentual', value: 101 },        'value (percentual) deve estar entre 1 e 100'],
            [{ code: 'OK', type: 'brinde', gift_description: ' ' }, 'gift_description é obrigatório para cupons do tipo brinde'],
            [{ code: 'OK', type: 'frete_gratis', min_sale_value: -1 }, 'min_sale_value não pode ser negativo'],
            [{ code: 'OK', value: 'dez' },                          'value deve ser um número'],
        ])('400 para %j', async (payload, message) => {
            const res = await create(payload);
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe(message);
        });

        it('409 para código repetido na mesma empresa (sem diferenciar maiúsculas), ok em outra empresa', async () => {
            const c = code();
            expect((await create({ code: c, value: 5 })).statusCode).toBe(201);
            const dup = await create({ code: c.toUpperCase(), value: 5 });
            expect(dup.statusCode).toBe(409);
            expect(errorOf(dup)).toBe('Já existe um cupom com esse código');
            expect((await create({ code: c, value: 5 }, otherAdminToken)).statusCode).toBe(201);
        });
    });

    describe('atualização', () => {
        it('mescla com o cupom atual: só os campos enviados mudam', async () => {
            const created = JSON.parse((await create({ code: code(), type: 'fixo', value: 10, min_sale_value: 50 })).body);
            const res = await update(created.id, { is_active: false });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toMatchObject({
                code: created.code, type: 'fixo', value: '10.00', min_sale_value: '50.00', is_active: false,
            });
        });

        it('trocar o tipo sem mandar value zera o value (e falha se o novo tipo exige value)', async () => {
            const created = JSON.parse((await create({ code: code(), type: 'fixo', value: 10 })).body);
            const bad = await update(created.id, { type: 'percentual' });
            expect(bad.statusCode).toBe(400);
            expect(errorOf(bad)).toBe('value deve ser maior que zero para este tipo de cupom');

            const ok = await update(created.id, { type: 'frete_gratis' });
            expect(ok.statusCode).toBe(200);
            expect(JSON.parse(ok.body).value).toBeNull();
        });

        it('virar brinde exige gift_description e zera o value', async () => {
            const created = JSON.parse((await create({ code: code(), type: 'fixo', value: 10 })).body);
            const bad = await update(created.id, { type: 'brinde' });
            expect(errorOf(bad)).toBe('gift_description é obrigatório para cupons do tipo brinde');
            const ok = await update(created.id, { type: 'brinde', gift_description: 'Chaveiro' });
            expect(JSON.parse(ok.body)).toMatchObject({ type: 'brinde', value: null, gift_description: 'Chaveiro' });
        });

        it('409 ao renomear para código de outro cupom; renomear para o próprio código é ok', async () => {
            const a = JSON.parse((await create({ code: code(), value: 5 })).body);
            const b = JSON.parse((await create({ code: code(), value: 5 })).body);
            expect((await update(b.id, { code: a.code.toLowerCase() })).statusCode).toBe(409);
            expect((await update(b.id, { code: b.code })).statusCode).toBe(200);
        });

        it('404 para cupom de outra empresa, sem alterar nada', async () => {
            const created = JSON.parse((await create({ code: code(), value: 5 })).body);
            const res = await update(created.id, { is_active: false }, otherAdminToken);
            expect(res.statusCode).toBe(404);
            expect(errorOf(res)).toBe('Cupom não encontrado');
            const [row] = await db.select().from(cupons).where(eq(cupons.id, created.id));
            expect(row.is_active).toBe(true);
        });
    });

    describe('listagem, remoção e acesso', () => {
        it('lista só os cupons da empresa, mais recentes primeiro', async () => {
            const res = await app.inject({ method: 'GET', url: BASE, headers: as(adminToken) });
            expect(res.statusCode).toBe(200);
            const list = JSON.parse(res.body) as Array<{ company_id: string; created_at: string }>;
            expect(list.length).toBeGreaterThan(0);
            expect(list.every((c) => c.company_id === companyId)).toBe(true);
            const dates = list.map((c) => new Date(c.created_at).getTime());
            expect([...dates].sort((x, y) => y - x)).toEqual(dates);
        });

        it('delete: 204, depois 404; outra empresa → 404', async () => {
            const created = JSON.parse((await create({ code: code(), value: 5 })).body);
            const foreign = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(otherAdminToken) });
            expect(foreign.statusCode).toBe(404);
            const del = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(adminToken) });
            expect(del.statusCode).toBe(204);
            const again = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(adminToken) });
            expect(again.statusCode).toBe(404);
        });

        it('atendente não acessa (403)', async () => {
            const res = await app.inject({ method: 'GET', url: BASE, headers: as(attendantToken) });
            expect(res.statusCode).toBe(403);
        });
    });
});
