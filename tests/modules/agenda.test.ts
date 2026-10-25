import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { agendamentos } from '../../src/modules/agenda/agenda.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

/**
 * Agenda (admin): CRUD de agendamentos por empresa e listagem por período.
 * Empresas de teste não têm Google conectado — a sincronização é coberta em
 * tests/unit/agenda.service.test.ts.
 */

const SUFFIX = Date.now();
const BASE = '/api/v1/agenda';

describe('Agenda', () => {
    const app = buildApp();
    let companyId: string;
    let adminId: string;
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
                .values({ name: `Empresa Agenda ${label} ${SUFFIX}`, status: true })
                .returning({ id: companies.id });
            return co.id;
        }
        async function login(email: string, password: string) {
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
            return JSON.parse(res.body).access_token as string;
        }
        async function makeUserAndLogin(label: string, profileId: number, coId: string) {
            const email = `agenda-${label}-${SUFFIX}@test.com`;
            const [u] = await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId,
                email_verified: true, is_approved: true,
            }).returning({ id: users.id });
            return { id: u.id, token: await login(email, 'senha123') };
        }

        companyId = await makeCompany('A');
        const otherCompanyId = await makeCompany('B');
        const admin = await makeUserAndLogin('admin', adminProfile.id, companyId);
        adminId = admin.id;
        adminToken = admin.token;
        attendantToken = (await makeUserAndLogin('attendant', userProfile.id, companyId)).token;
        otherAdminToken = (await makeUserAndLogin('other-admin', adminProfile.id, otherCompanyId)).token;
        superAdminToken = await login('filipe@kelmor.com', 'kelmor123');
    });

    afterAll(async () => { await app.close(); });

    const as = (token: string) => ({ authorization: `Bearer ${token}` });
    const create = (payload: Record<string, unknown>, token = adminToken) =>
        app.inject({ method: 'POST', url: BASE, headers: as(token), payload });
    const update = (id: string, payload: Record<string, unknown>, token = adminToken) =>
        app.inject({ method: 'PUT', url: `${BASE}/${id}`, headers: as(token), payload });
    const list = (query: string, token = adminToken) =>
        app.inject({ method: 'GET', url: `${BASE}${query}`, headers: as(token) });
    const errorOf = (res: { body: string }) => JSON.parse(res.body).error;
    const event = (over: Record<string, unknown> = {}) => ({
        title: 'Visita', start_at: '2030-03-10T13:00:00.000Z', end_at: '2030-03-10T14:00:00.000Z', ...over,
    });

    describe('criação', () => {
        it('aplica os padrões e registra quem criou', async () => {
            const res = await create(event({ title: '  Reunião  ' }));
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toMatchObject({
                company_id: companyId, created_by: adminId, title: 'Reunião',
                start_at: '2030-03-10T13:00:00.000Z', end_at: '2030-03-10T14:00:00.000Z',
                lead_id: null, color: '#6366f1', notes: null,
                notify_on_create: true, reminder_minutes: null, remind_at_exact: false,
                notify_groups: [], google_event_id: null,
            });
        });

        it('guarda todos os campos enviados', async () => {
            const res = await create(event({
                lead_id: 'lead-42', color: '#ef4444', notes: 'Levar contrato',
                notify_on_create: false, reminder_minutes: 30, remind_at_exact: true, notify_groups: [1, 2],
            }));
            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toMatchObject({
                lead_id: 'lead-42', color: '#ef4444', notes: 'Levar contrato',
                notify_on_create: false, reminder_minutes: 30, remind_at_exact: true, notify_groups: [1, 2],
            });
        });

        it.each([
            [{ title: '' },                                            'title é obrigatório'],
            [{ title: '   ' },                                         'title é obrigatório'],
            [{ start_at: undefined },                                  'start_at e end_at são obrigatórios'],
            [{ end_at: undefined },                                    'start_at e end_at são obrigatórios'],
            [{ start_at: 'amanhã' },                                   'start_at inválido'],
            [{ end_at: '2030-02-30T25:00' },                           'end_at inválido'],
            [{ end_at: '2030-03-10T12:00:00.000Z' },                   'end_at não pode ser antes de start_at'],
            [{ color: '#'.padEnd(21, 'f') },                           'color inválida'],
            [{ reminder_minutes: -5 },                                 'reminder_minutes inválido'],
            [{ notify_groups: ['fila'] },                              'notify_groups inválido'],
        ])('400 para %j', async (over, message) => {
            const res = await create(event(over));
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe(message);
        });

        it('início e fim iguais é permitido', async () => {
            const res = await create(event({ end_at: '2030-03-10T13:00:00.000Z' }));
            expect(res.statusCode).toBe(201);
        });
    });

    describe('listagem', () => {
        beforeAll(async () => {
            await create(event({ title: 'Abril início', start_at: '2030-04-01T00:00:00.000Z', end_at: '2030-04-01T01:00:00.000Z' }));
            await create(event({ title: 'Abril fim',    start_at: '2030-04-30T23:00:00.000Z', end_at: '2030-04-30T23:30:00.000Z' }));
            await create(event({ title: 'Maio',         start_at: '2030-05-02T10:00:00.000Z', end_at: '2030-05-02T11:00:00.000Z' }));
            await create(event({ title: 'Abril outra empresa', start_at: '2030-04-10T10:00:00.000Z', end_at: '2030-04-10T11:00:00.000Z' }), otherAdminToken);
        });

        it('filtra pelo início do evento dentro do período (limites inclusivos), só da empresa', async () => {
            const res = await list('?start=2030-04-01T00:00:00.000Z&end=2030-04-30T23:59:59.999Z');
            expect(res.statusCode).toBe(200);
            const titles = JSON.parse(res.body).map((e: { title: string }) => e.title);
            expect(titles).toEqual(['Abril início', 'Abril fim']);
        });

        it('sem período: mês atual inteiro, inclusive o último dia', async () => {
            const now = new Date();
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 15, 0);
            const created = JSON.parse((await create(event({
                title: `Último dia ${SUFFIX}`, start_at: lastDay.toISOString(), end_at: new Date(lastDay.getTime() + 3600_000).toISOString(),
            }))).body);
            const titles = JSON.parse((await list('')).body).map((e: { id: string }) => e.id);
            expect(titles).toContain(created.id);
        });

        it('período inválido → 400', async () => {
            const res = await list('?start=ontem&end=2030-04-30T00:00:00.000Z');
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe('start inválido');
        });
    });

    describe('edição', () => {
        it('altera só os campos enviados', async () => {
            const created = JSON.parse((await create(event({ notes: 'Original', color: '#22c55e' }))).body);
            const res = await update(created.id, { title: '  Visita remarcada ', start_at: '2030-03-10T15:00:00.000Z', end_at: '2030-03-10T16:00:00.000Z' });
            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toMatchObject({
                title: 'Visita remarcada', start_at: '2030-03-10T15:00:00.000Z', end_at: '2030-03-10T16:00:00.000Z',
                notes: 'Original', color: '#22c55e',
            });
        });

        it('ignora campos fora do contrato (empresa, autor, evento do Google)', async () => {
            const created = JSON.parse((await create(event())).body);
            const res = await update(created.id, {
                notes: 'x', company_id: '00000000-0000-0000-0000-000000000000',
                created_by: '00000000-0000-0000-0000-000000000000', google_event_id: 'forjado',
            });
            expect(res.statusCode).toBe(200);
            const [row] = await db.select().from(agendamentos).where(eq(agendamentos.id, created.id));
            expect(row).toMatchObject({ company_id: companyId, created_by: adminId, google_event_id: null, notes: 'x' });
        });

        it.each([
            [{ title: ' ' },                                'title é obrigatório'],
            [{ start_at: 'x' },                             'start_at inválido'],
            [{ start_at: '2030-03-10T18:00:00.000Z' },      'end_at não pode ser antes de start_at'],
        ])('400 para %j (considera o que já está salvo)', async (patch, message) => {
            const created = JSON.parse((await create(event())).body);
            const res = await update(created.id, patch);
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe(message);
        });

        it('404 para outra empresa, sem alterar', async () => {
            const created = JSON.parse((await create(event())).body);
            const res = await update(created.id, { title: 'Invadido' }, otherAdminToken);
            expect(res.statusCode).toBe(404);
            expect(errorOf(res)).toBe('Agendamento não encontrado');
            const [row] = await db.select().from(agendamentos).where(eq(agendamentos.id, created.id));
            expect(row.title).toBe('Visita');
        });

        it('id malformado → 400', async () => {
            const res = await update('nao-e-uuid', { title: 'x' });
            expect(res.statusCode).toBe(400);
            expect(errorOf(res)).toBe('id inválido');
        });
    });

    describe('remoção e acesso', () => {
        it('204, depois 404; outra empresa → 404', async () => {
            const created = JSON.parse((await create(event())).body);
            const foreign = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(otherAdminToken) });
            expect(foreign.statusCode).toBe(404);
            const del = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(adminToken) });
            expect(del.statusCode).toBe(204);
            const again = await app.inject({ method: 'DELETE', url: `${BASE}/${created.id}`, headers: as(adminToken) });
            expect(again.statusCode).toBe(404);
        });

        it('atendente → 403; superAdmin (sem empresa) → 403', async () => {
            expect((await list('', attendantToken)).statusCode).toBe(403);
            const res = await list('', superAdminToken);
            expect(res.statusCode).toBe(403);
            expect(errorOf(res)).toBe('Empresa não encontrada');
        });
    });
});
