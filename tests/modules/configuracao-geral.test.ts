import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/**
 * Configurações gerais da empresa: leitura (com criação dos padrões),
 * edição parcial de permissões, mensagens automáticas e e-mails de aviso.
 * Permissão de leitura/escrita por perfil: configuracao-geral-permissions.test.ts.
 */

const SUFFIX = Date.now();
const BASE = '/api/v1/configuracao/configuracoes-gerais';

describe('Configurações gerais', () => {
    const app = buildApp();
    let companyId: string;
    let otherCompanyId: string;
    let adminToken: string;
    let otherAdminToken: string;
    let superAdminToken: string;

    beforeAll(async () => {
        await app.ready();
        await runSeed();
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeCompany(label: string) {
            const [co] = await db.insert(companies)
                .values({ name: `Empresa ConfigGeral ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function login(email: string, password: string) {
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
            return JSON.parse(res.body).access_token as string;
        }
        async function makeAdmin(label: string, coId: string) {
            const email = `config-geral-${label}-${SUFFIX}@test.com`;
            await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: adminProfile.id, company_id: coId,
                email_verified: true, is_approved: true,
            });
            return login(email, 'senha123');
        }

        companyId = await makeCompany('A');
        otherCompanyId = await makeCompany('B');
        adminToken = await makeAdmin('admin', companyId);
        otherAdminToken = await makeAdmin('other', otherCompanyId);
        superAdminToken = await login('filipe@kelmor.com', 'kelmor123');
    });

    afterAll(async () => { await app.close(); });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const get = async (token = adminToken) => {
        const res = await app.inject({ method: 'GET', url: BASE, headers: as(token) });
        return { res, body: JSON.parse(res.body) };
    };
    const put = async (payload: Record<string, unknown>, token = adminToken) => {
        const res = await app.inject({ method: 'PUT', url: BASE, headers: as(token), payload });
        return { res, body: JSON.parse(res.body) };
    };

    describe('leitura', () => {
        it('primeira leitura cria a configuração com os padrões', async () => {
            const { res, body } = await get();
            expect(res.statusCode).toBe(200);
            expect(body).toMatchObject({
                company_id: companyId,
                init_message: null, end_message: null, transfer_message: null,
                close_open_tickets: false, close_open_tickets_interval: 24,
                close_pending_tickets: false, close_pending_tickets_interval: 48,
                interval_between_ended_message: 6, interval_between_init_message: 1, interval_between_nps: 24,
                research_interval: 5,
                show_ticket_name_message: true, send_ticket_goodbye_msg: true, send_ticket_transfer_msg: true,
                transfer_between_connections: true, update_contact_name: true,
                spy_ticket: false, limit_services_users: false, number_limit_services_users: 5,
                gamification_enabled: true, sale_xp_amount: 10,
                idle_bot_ticket_queue_id: null,
                notify_emails: [],
            });
            expect(typeof body.id).toBe('number');
        });

        it('leituras seguintes reaproveitam a mesma configuração', async () => {
            const first = (await get()).body;
            const second = (await get()).body;
            expect(second.id).toBe(first.id);
            const rows = await db.select().from(companyPermissions).where(eq(companyPermissions.company_id, companyId));
            expect(rows).toHaveLength(1);
        });

        it('superAdmin (sem empresa) → 403', async () => {
            const { res, body } = await get(superAdminToken);
            expect(res.statusCode).toBe(403);
            expect(body.error).toBe('Empresa não encontrada');
        });
    });

    describe('edição', () => {
        it('altera só as permissões enviadas', async () => {
            const { res, body } = await put({ spy_ticket: true, sale_xp_amount: 25, interval_between_nps: 12.5 });
            expect(res.statusCode).toBe(200);
            expect(body).toMatchObject({ spy_ticket: true, sale_xp_amount: 25, interval_between_nps: 12.5, number_limit_services_users: 5, gamification_enabled: true });
        });

        it('aceita o formulário inteiro reenviado (com id, company_id e datas), sem trocar a empresa', async () => {
            const current = (await get()).body;
            const { res, body } = await put({ ...current, company_id: otherCompanyId, id: 999999, return_ticket: true, campo_inexistente: 1 });
            expect(res.statusCode).toBe(200);
            expect(body).toMatchObject({ id: current.id, company_id: companyId, return_ticket: true });
            expect(body).not.toHaveProperty('campo_inexistente');
            expect((await get(otherAdminToken)).body.return_ticket).toBe(false);
        });

        it('mensagens: HTML guardado como veio; vazia (só tags) vira null; ausente não muda', async () => {
            await put({ init_message: '<p>Olá, {{nome}}!</p>', end_message: '<p>Tchau</p>' });
            const { body } = await put({ end_message: '<p> </p>' });
            expect(body).toMatchObject({ init_message: '<p>Olá, {{nome}}!</p>', end_message: null, transfer_message: null });
        });

        it('e-mails de aviso: lista substituída, sem espaços, sem repetidos, sem vazios; [] limpa; ausente não muda', async () => {
            const { body } = await put({ notify_emails: [' dono@empresa.com ', 'dono@empresa.com', '', 'ti@empresa.com'] });
            expect(body.notify_emails.sort()).toEqual(['dono@empresa.com', 'ti@empresa.com']);
            expect((await put({ spy_ticket: false })).body.notify_emails).toHaveLength(2);
            expect((await put({ notify_emails: [] })).body.notify_emails).toEqual([]);
        });

        it('não altera a configuração de outra empresa', async () => {
            await put({ active_crm: true });
            expect((await get(otherAdminToken)).body.active_crm).toBe(false);
        });

        it.each([
            [{ spy_ticket: 'sim' },                         'spy_ticket inválido'],
            [{ close_open_tickets_interval: -1 },          'close_open_tickets_interval inválido'],
            [{ close_pending_tickets_interval: 1.5 },      'close_pending_tickets_interval inválido'],
            [{ interval_between_init_message: -0.5 },      'interval_between_init_message inválido'],
            [{ research_interval: 'cinco' },               'research_interval inválido'],
            [{ number_limit_services_users: 0 },           'number_limit_services_users inválido'],
            [{ sale_xp_amount: -10 },                      'sale_xp_amount inválido'],
            [{ idle_bot_ticket_queue_id: 'fila' },         'idle_bot_ticket_queue_id inválido'],
            [{ notify_emails: ['dono@empresa.com', 'sem-arroba'] }, 'E-mail inválido: sem-arroba'],
            [{ init_message: 123 },                        'init_message inválido'],
        ])('400 para %j, sem gravar nada', async (payload, message) => {
            const before = (await get()).body;
            const { res, body } = await put({ ...payload, active_kanban: !before.active_kanban });
            expect(res.statusCode).toBe(400);
            expect(body.error).toBe(message);
            expect((await get()).body.active_kanban).toBe(before.active_kanban);
        });
    });
});
