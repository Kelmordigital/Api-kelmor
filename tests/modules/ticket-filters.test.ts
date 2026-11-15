import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';
import { ticketInbox } from '../../src/modules/atendimento/atendimento.module';

/**
 * Testa os filtros novos do ticketInbox.list (queueId, mineUserId, orderBy)
 * contra o banco de teste. Sem viewer → sem restrição de visibilidade por fila.
 */

const SUFFIX = Date.now();
let companyId: string;
let userA: string; // atendente do ticket 1, fechou o ticket 3
let userB: string; // atendente do ticket 2

beforeAll(async () => {
    await runSeed(); // garante profiles

    const [profile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'user'));

    const [co] = await db.insert(companies)
        .values({ name: 'Empresa Filtros Teste', status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [ua] = await db.insert(users).values({
        name: 'Atendente A', email: `filtros-a-${SUFFIX}@test.com`,
        password_hash: hashSync('senha123', 10),
        profile_id: profile.id, company_id: companyId,
        email_verified: true, is_approved: true,
    }).returning({ id: users.id });
    userA = ua.id;

    const [ub] = await db.insert(users).values({
        name: 'Atendente B', email: `filtros-b-${SUFFIX}@test.com`,
        password_hash: hashSync('senha123', 10),
        profile_id: profile.id, company_id: companyId,
        email_verified: true, is_approved: true,
    }).returning({ id: users.id });
    userB = ub.id;

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: 'Contato Filtros' })
        .returning({ id: contacts.id });

    // 4 tickets: fila, conexão, atendente, closed_by, pin e datas variados
    await db.insert(tickets).values([
        // t1: fila 10, conexão 1, atendente A, aberto, jan/2026
        { company_id: companyId, contact_id: ct.id, status_id: 2, queue_id: 10,
          connection_id: 1, attendant_user_id: userA,
          updated_at: new Date('2026-01-01T10:00:00Z') },
        // t2: fila 20, conexão 2, atendente B, aberto, mar/2026 (mais recente)
        { company_id: companyId, contact_id: ct.id, status_id: 2, queue_id: 20,
          connection_id: 2, attendant_user_id: userB,
          updated_at: new Date('2026-03-01T10:00:00Z') },
        // t3: fila 10, fechado por A (sem atendente), fev/2026
        { company_id: companyId, contact_id: ct.id, status_id: 3, queue_id: 10,
          connection_id: 1, closed_by_user_id: userA,
          updated_at: new Date('2026-02-01T10:00:00Z') },
        // t4: pendente, fixado (pin), o mais antigo de todos
        { company_id: companyId, contact_id: ct.id, status_id: 1, queue_id: 20,
          connection_id: 1, pinned: 1,
          updated_at: new Date('2025-12-01T10:00:00Z') },
    ]);
});

describe('ticketInbox.list — filtros novos', () => {
    it('queueId filtra pela fila', async () => {
        const list = await ticketInbox.list(companyId, { queueId: 10 });
        expect(list).toHaveLength(2);
        expect(list.every(t => t.queue_id === 10)).toBe(true);
    });

    it('mineUserId retorna tickets onde sou atendente OU quem fechou', async () => {
        const list = await ticketInbox.list(companyId, { mineUserId: userA });
        expect(list).toHaveLength(2); // t1 (atendente) + t3 (closed_by)
        const ids = list.map(t => t.attendant_user_id ?? t.closed_by_user_id);
        expect(ids.every(id => id === userA)).toBe(true);
    });

    it('orderBy ASC: mais antigos primeiro, pinado sempre no topo', async () => {
        const list = await ticketInbox.list(companyId, { orderBy: 'ASC' });
        expect(list).toHaveLength(4);
        expect(list[0].pinned).toBe(1); // t4 pinado vem primeiro mesmo sendo o mais antigo
        const rest = list.slice(1).map(t => new Date(t.updated_at as unknown as string).getTime());
        expect(rest).toEqual([...rest].sort((a, b) => a - b));
    });

    it('sem orderBy (default DESC): mais recentes primeiro após pinados', async () => {
        const list = await ticketInbox.list(companyId, {});
        expect(list).toHaveLength(4);
        expect(list[0].pinned).toBe(1);
        const rest = list.slice(1).map(t => new Date(t.updated_at as unknown as string).getTime());
        expect(rest).toEqual([...rest].sort((a, b) => b - a));
    });
});

describe('GET /api/v1/atendimento/tickets — novos parâmetros', () => {
    const app = buildApp();
    let adminToken: string;

    beforeAll(async () => {
        await app.ready();

        // admin (visibilidade total) para exercitar os params sem interferência do viewer
        const [adminProfile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'admin'));
        await db.insert(users).values({
            name: 'Admin Filtros', email: `filtros-admin-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: adminProfile.id, company_id: companyId,
            email_verified: true, is_approved: true,
        });

        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `filtros-admin-${SUFFIX}@test.com`, password: 'senha123' },
        });
        adminToken = JSON.parse(login.body).access_token;
    });

    afterAll(async () => { await app.close(); });

    function get(qs: string) {
        return app.inject({
            method: 'GET', url: `/api/v1/atendimento/tickets${qs}`,
            headers: { authorization: `Bearer ${adminToken}` },
        });
    }

    it('queueId filtra pela fila', async () => {
        const res = await get('?queueId=10');
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body).toHaveLength(2);
    });

    it('userId filtra pelo atendente', async () => {
        const res = await get(`?userId=${userB}`);
        const body = JSON.parse(res.body);
        expect(body).toHaveLength(1);
        expect(body[0].attendant_user_id).toBe(userB);
    });

    it('showAll=false restringe a meus tickets (admin não atende nenhum → vazio)', async () => {
        const res = await get('?showAll=false');
        expect(JSON.parse(res.body)).toHaveLength(0);
    });

    it('orderBy=ASC inverte a ordem mantendo pinado no topo', async () => {
        const res = await get('?orderBy=ASC');
        const body = JSON.parse(res.body);
        expect(body[0].pinned).toBe(1);
        const rest = body.slice(1).map((t: { updated_at: string }) => new Date(t.updated_at).getTime());
        expect(rest).toEqual([...rest].sort((a: number, b: number) => a - b));
    });
});
