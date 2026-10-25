import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts } from '../../src/modules/atendimento/atendimento.db.schema';
import { etiquetas } from '../../src/modules/etiquetas/etiqueta.db.schema';
import { buildApp } from '../../src/shared/server';

/**
 * Etiquetas pela API: cadastro, aplicação em contatos, estatísticas e CRUD das
 * regras automáticas. O casamento de palavras-chave: automatic-tags.test.ts.
 */

const SUFFIX = Date.now();

describe('Etiquetas', () => {
    const app = buildApp();
    let companyId: string;
    let otherCompanyId: string;
    let adminToken: string;
    let attendantToken: string;
    let otherAdminToken: string;
    let contactId: number;
    let foreignContactId: number;

    beforeAll(async () => {
        await app.ready();
        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies)
                .values({ name: `Empresa Etiquetas ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function makeUser(label: string, profileId: number, coId: string) {
            const email = `etiquetas-${label}-${SUFFIX}@test.com`;
            await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId, email_verified: true, is_approved: true,
            });
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha123' } });
            return JSON.parse(res.body).access_token as string;
        }

        companyId = await makeCompany('A');
        otherCompanyId = await makeCompany('B');
        adminToken = await makeUser('admin', adminProfile.id, companyId);
        attendantToken = await makeUser('attendant', userProfile.id, companyId);
        otherAdminToken = await makeUser('other', adminProfile.id, otherCompanyId);
        const [c] = await db.insert(contacts).values({ company_id: companyId, name: 'Cliente' }).returning({ id: contacts.id });
        const [fc] = await db.insert(contacts).values({ company_id: otherCompanyId, name: 'Cliente B' }).returning({ id: contacts.id });
        contactId = c.id;
        foreignContactId = fc.id;
    });

    afterAll(async () => { await app.close(); });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object, token = adminToken) =>
        app.inject({ method, url: `/api/v1${url}`, headers: as(token), ...(payload ? { payload } : {}) });
    const createTag = async (payload: object, token = adminToken) => JSON.parse((await call('POST', '/etiquetas', payload, token)).body);
    const errorOf = (res: { body: string }) => JSON.parse(res.body).error;

    describe('cadastro', () => {
        it('cria com padrões de cor e ícone; nome sem espaços nas pontas', async () => {
            const res = await call('POST', '/etiquetas', { name: '  VIP  ' });
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toMatchObject({ company_id: companyId, name: 'VIP', color: '#6366f1', icon: 'tag' });
        });

        it('lista só as da empresa, mais recentes primeiro', async () => {
            await createTag({ name: 'Outra empresa' }, otherAdminToken);
            const second = await createTag({ name: 'Recente', color: '#ef4444', icon: 'star' });
            const list = JSON.parse((await call('GET', '/etiquetas')).body) as Array<{ id: string; company_id: string }>;
            expect(list[0].id).toBe(second.id);
            expect(list.every((t) => t.company_id === companyId)).toBe(true);
        });

        it('edita nome, cor e ícone; outra empresa → 404', async () => {
            const tag = await createTag({ name: 'Editar' });
            const res = await call('PUT', `/etiquetas/${tag.id}`, { name: 'Editada', color: '#22c55e', icon: 'heart' });
            expect(JSON.parse(res.body)).toMatchObject({ name: 'Editada', color: '#22c55e', icon: 'heart' });
            const foreign = await call('PUT', `/etiquetas/${tag.id}`, { name: 'x' }, otherAdminToken);
            expect(foreign.statusCode).toBe(404);
            expect(errorOf(foreign)).toBe('Etiqueta não encontrada');
        });

        it('exclui: 204, depois 404', async () => {
            const tag = await createTag({ name: 'Excluir' });
            expect((await call('DELETE', `/etiquetas/${tag.id}`)).statusCode).toBe(204);
            expect((await call('DELETE', `/etiquetas/${tag.id}`)).statusCode).toBe(404);
        });

        it('atendente também cadastra etiquetas', async () => {
            expect((await call('POST', '/etiquetas', { name: 'Do atendente' }, attendantToken)).statusCode).toBe(201);
        });
    });

    describe('etiquetas no contato', () => {
        it('aplica (idempotente), lista e remove', async () => {
            const tag = await createTag({ name: 'Aplicar' });
            expect((await call('POST', `/contacts/${contactId}/etiquetas/${tag.id}`)).statusCode).toBe(204);
            expect((await call('POST', `/contacts/${contactId}/etiquetas/${tag.id}`)).statusCode).toBe(204);
            const list = JSON.parse((await call('GET', `/contacts/${contactId}/etiquetas`)).body) as Array<{ id: string }>;
            expect(list.filter((t) => t.id === tag.id)).toHaveLength(1);

            expect((await call('DELETE', `/contacts/${contactId}/etiquetas/${tag.id}`)).statusCode).toBe(204);
            const after = JSON.parse((await call('GET', `/contacts/${contactId}/etiquetas`)).body) as Array<{ id: string }>;
            expect(after.some((t) => t.id === tag.id)).toBe(false);
        });

        it('contato de outra empresa: lista vazia e remover não mexe em nada', async () => {
            const foreignTag = await createTag({ name: 'Tag B' }, otherAdminToken);
            await call('POST', `/contacts/${foreignContactId}/etiquetas/${foreignTag.id}`, undefined, otherAdminToken);
            expect(JSON.parse((await call('GET', `/contacts/${foreignContactId}/etiquetas`)).body)).toEqual([]);
            expect((await call('DELETE', `/contacts/${foreignContactId}/etiquetas/${foreignTag.id}`)).statusCode).toBe(204);
            const stillThere = JSON.parse((await call('GET', `/contacts/${foreignContactId}/etiquetas`, undefined, otherAdminToken)).body);
            expect(stillThere).toHaveLength(1);
        });

        it('aplicar etiqueta ou contato de outra empresa → 404 (antes: 500)', async () => {
            const own = await createTag({ name: 'Minha' });
            const foreignTag = await createTag({ name: 'Alheia' }, otherAdminToken);
            const res1 = await call('POST', `/contacts/${contactId}/etiquetas/${foreignTag.id}`);
            expect(res1.statusCode).toBe(404);
            expect(errorOf(res1)).toBe('Etiqueta não encontrada');
            const res2 = await call('POST', `/contacts/${foreignContactId}/etiquetas/${own.id}`);
            expect(res2.statusCode).toBe(404);
            expect(errorOf(res2)).toBe('Contato não encontrado');
        });
    });

    describe('estatísticas', () => {
        it('total de contatos por etiqueta e série dos últimos 7 dias (hoje conta)', async () => {
            const tag = await createTag({ name: 'Estatística' });
            await call('POST', `/contacts/${contactId}/etiquetas/${tag.id}`);
            const stats = JSON.parse((await call('GET', '/etiquetas/stats')).body) as Array<{ etiqueta_id: string; total_leads: number; series: { date: string; count: number }[] }>;
            const s = stats.find((x) => x.etiqueta_id === tag.id)!;
            expect(s).toMatchObject({ name: 'Estatística', total_leads: 1 });
            expect(s.series).toHaveLength(7);
            expect(s.series[6].date).toBe(new Date().toISOString().slice(0, 10));
            expect(s.series[6].count).toBe(1);
        });
    });

    describe('regras automáticas (HTTP)', () => {
        it('cria, lista, edita e exclui', async () => {
            const tag = await createTag({ name: 'Regra' });
            const created = await call('POST', '/etiquetas/regras-automaticas', { keywords: ' fralda, frauda ', etiqueta_ids: [tag.id] });
            expect(created.statusCode).toBe(201);
            const rule = JSON.parse(created.body);
            expect(rule).toMatchObject({ keywords: 'fralda, frauda', etiqueta_ids: [tag.id] });

            const list = JSON.parse((await call('GET', '/etiquetas/regras-automaticas')).body) as Array<{ id: number }>;
            expect(list.some((r) => r.id === rule.id)).toBe(true);

            const upd = JSON.parse((await call('PUT', `/etiquetas/regras-automaticas/${rule.id}`, { keywords: 'whey' })).body);
            expect(upd).toMatchObject({ keywords: 'whey', etiqueta_ids: [] });

            expect((await call('DELETE', `/etiquetas/regras-automaticas/${rule.id}`)).statusCode).toBe(204);
            const again = await call('DELETE', `/etiquetas/regras-automaticas/${rule.id}`);
            expect(again.statusCode).toBe(404);
            expect(errorOf(again)).toBe('Regra não encontrada');
        });

        it('palavras-chave em branco → 400; regra de outra empresa → 404', async () => {
            const blank = await call('POST', '/etiquetas/regras-automaticas', { keywords: '  ' });
            expect(blank.statusCode).toBe(400);
            expect(errorOf(blank)).toBe('keywords é obrigatório');
            const rule = JSON.parse((await call('POST', '/etiquetas/regras-automaticas', { keywords: 'x' })).body);
            expect((await call('PUT', `/etiquetas/regras-automaticas/${rule.id}`, { keywords: 'y' }, otherAdminToken)).statusCode).toBe(404);
            await call('DELETE', `/etiquetas/regras-automaticas/${rule.id}`);
        });
    });

    describe('validação e isolamento', () => {
        it('edição ignora campos fora do contrato (não move etiqueta de empresa)', async () => {
            const tag = await createTag({ name: 'Presa' });
            const res = await call('PUT', `/etiquetas/${tag.id}`, { name: 'Presa 2', company_id: otherCompanyId, id: crypto.randomUUID() });
            expect(res.statusCode).toBe(200);
            const [row] = await db.select().from(etiquetas).where(eq(etiquetas.id, tag.id));
            expect(row).toMatchObject({ name: 'Presa 2', company_id: companyId });
        });

        it.each([
            ['POST', '/etiquetas',     { name: 'x'.repeat(101) },        'name deve ter no máximo 100 caracteres'],
            ['POST', '/etiquetas',     { name: 'Cor', color: 'x'.repeat(21) }, 'color inválida'],
            ['POST', '/etiquetas',     { name: 'Ícone', icon: 'x'.repeat(51) }, 'icon inválido'],
            ['PUT',  '/etiquetas/nao-e-uuid', { name: 'x' },             'id inválido'],
            ['POST', '/etiquetas/regras-automaticas', { keywords: 'x', etiqueta_ids: ['nao-e-uuid'] }, 'etiqueta_ids inválido'],
            ['PUT',  '/etiquetas/regras-automaticas/abc', { keywords: 'x' }, 'id inválido'],
            ['POST', '/contacts/abc/etiquetas/00000000-0000-0000-0000-000000000000', undefined, 'contactId inválido'],
        ] as const)('%s %s → 400', async (method, url, payload, message) => {
            const res = await call(method, url, payload);
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe(message);
        });

        it('edição: nome em branco → 400', async () => {
            const tag = await createTag({ name: 'Nome' });
            const res = await call('PUT', `/etiquetas/${tag.id}`, { name: '  ' });
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe('name é obrigatório');
        });
    });
});
