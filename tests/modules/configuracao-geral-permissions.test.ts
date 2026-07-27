import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;

describe('GET/PUT /configuracao/configuracoes-gerais — leitura liberada, escrita só admin', () => {
    const app = buildApp();
    let attendantToken: string;
    let adminToken: string;

    beforeAll(async () => {
        await app.ready();
        const [userProfile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'user'));
        const [adminProfile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'admin'));

        const [co] = await db.insert(companies)
            .values({ name: `Empresa ConfigGeralPerms ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;

        async function makeUser(label: string, profileId: number) {
            await db.insert(users).values({
                name: label, email: `config-geral-perms-${label}-${SUFFIX}@test.com`,
                password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: companyId,
                email_verified: true, is_approved: true,
            });
        }
        await makeUser('attendant', userProfile.id);
        await makeUser('admin', adminProfile.id);

        async function login(label: string) {
            const res = await app.inject({
                method: 'POST', url: '/api/v1/auth/login',
                payload: { email: `config-geral-perms-${label}-${SUFFIX}@test.com`, password: 'senha123' },
            });
            return JSON.parse(res.body).access_token;
        }
        attendantToken = await login('attendant');
        adminToken = await login('admin');
    });

    // Regressão: useCompanyPermissions() (usado no app inteiro, por qualquer
    // perfil) dependia dessa rota — se fosse admin-only, todo toggle lido no
    // frontend por um atendente comum ficava sempre "desligado" pra ele,
    // não importa o valor real salvo pela empresa.
    it('atendente comum consegue LER as configurações (200)', async () => {
        const res = await app.inject({
            method: 'GET', url: '/api/v1/configuracao/configuracoes-gerais',
            headers: { authorization: `Bearer ${attendantToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toHaveProperty('spy_ticket');
    });

    it('atendente comum NÃO consegue alterar as configurações (403)', async () => {
        const res = await app.inject({
            method: 'PUT', url: '/api/v1/configuracao/configuracoes-gerais',
            headers: { authorization: `Bearer ${attendantToken}` },
            payload: { spy_ticket: true },
        });
        expect(res.statusCode).toBe(403);
    });

    it('admin consegue LER e ALTERAR as configurações', async () => {
        const get = await app.inject({
            method: 'GET', url: '/api/v1/configuracao/configuracoes-gerais',
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(get.statusCode).toBe(200);

        const put = await app.inject({
            method: 'PUT', url: '/api/v1/configuracao/configuracoes-gerais',
            headers: { authorization: `Bearer ${adminToken}` },
            payload: { spy_ticket: true },
        });
        expect(put.statusCode).toBe(200);
        expect(JSON.parse(put.body).spy_ticket).toBe(true);
    });
});
