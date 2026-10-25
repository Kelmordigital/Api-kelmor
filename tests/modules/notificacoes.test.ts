import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, connections, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { scheduledMessages } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.db.schema';
import { ScheduledMessageDispatcher } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.service';
import { DrizzleScheduledMessageRepository } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.repository';
import { notifier } from '../../src/modules/notificacoes/notificacao.module';
import { buildApp } from '../../src/shared/server';

/** Sino de notificações e o aviso de falha de mensagem agendada. */

const SUFFIX = Date.now();
const BASE = '/api/v1/notifications';

describe('Notificações', () => {
    const app = buildApp();
    let companyId: string;
    const ids: Record<string, string> = {};
    const tokens: Record<string, string> = {};
    let ticketId: number;
    let contactId: number;
    let connectionId: number;

    beforeAll(async () => {
        await app.ready();
        const [up] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [ap] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
        const [co] = await db.insert(companies).values({ name: `Empresa Notificações ${SUFFIX}`, status: true }).returning({ id: companies.id });
        companyId = co.id;
        const [other] = await db.insert(companies).values({ name: `Outra Notificações ${SUFFIX}`, status: true }).returning({ id: companies.id });

        for (const [label, profileId, coId] of [
            ['creator', up.id, companyId], ['colleague', up.id, companyId], ['admin', ap.id, companyId], ['otherAdmin', ap.id, other.id],
        ] as const) {
            const email = `notif-${label}-${SUFFIX}@test.com`;
            const [u] = await db.insert(users).values({
                name: label, email, password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: coId, email_verified: true, is_approved: true,
            }).returning({ id: users.id });
            ids[label] = u.id;
            const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha123' } });
            tokens[label] = JSON.parse(res.body).access_token;
        }

        [contactId] = (await db.insert(contacts).values({ company_id: companyId, name: 'Maria', number: '5511955550000' }).returning({ id: contacts.id })).map((c) => c.id);
        [connectionId] = (await db.insert(connections).values({ company_id: companyId, name: 'WA' }).returning({ id: connections.id })).map((c) => c.id);
        [ticketId] = (await db.insert(tickets).values({ company_id: companyId, contact_id: contactId, connection_id: connectionId, status_id: 2 }).returning({ id: tickets.id })).map((t) => t.id);
    });

    afterAll(async () => { await app.close(); });

    const as = (label: string) => ({ authorization: `Bearer ${tokens[label]}` });
    const mine = async (label: string) =>
        JSON.parse((await app.inject({ method: 'GET', url: BASE, headers: as(label) })).body) as { items: { id: number; type: string; title: string; body: string; data: Record<string, unknown>; read_at: string | null }[]; unread: number };

    it('falha de mensagem agendada avisa quem agendou e os admins da empresa — só eles', async () => {
        const [msg] = await db.insert(scheduledMessages).values({
            company_id: companyId, ticket_id: ticketId, contact_id: contactId, connection_id: connectionId,
            created_by: ids.creator, message: 'Seu pedido chegou! Podemos combinar a entrega?', send_date: new Date(Date.now() - 1000),
        }).returning();

        await new ScheduledMessageDispatcher(new DrizzleScheduledMessageRepository(db), { sendText: async () => { throw new Error('Conexão desconectada'); } }, notifier)
            .dispatchDue();

        for (const label of ['creator', 'admin']) {
            const { items, unread } = await mine(label);
            const n = items.find((i) => i.data?.scheduled_message_id === msg.id)!;
            expect(n).toMatchObject({
                type: 'scheduled_message_failed', title: 'Mensagem agendada não foi enviada',
                body: 'Maria: "Seu pedido chegou! Podemos combinar a entrega?" — Conexão desconectada',
                data: { ticket_id: ticketId, contact_id: contactId }, read_at: null,
            });
            expect(unread).toBeGreaterThanOrEqual(1);
        }
        expect((await mine('colleague')).items).toHaveLength(0);
        expect((await mine('otherAdmin')).items).toHaveLength(0);
    });

    it('marca uma como lida e depois todas; não mexe nas de outra pessoa', async () => {
        await notifier.notify({ companyId, userIds: [ids.creator] }, { type: 'teste', title: 'Segunda' });
        const before = await mine('creator');
        const target = before.items[0];

        expect((await app.inject({ method: 'POST', url: `${BASE}/${target.id}/read`, headers: as('admin') })).statusCode).toBe(404);
        expect((await app.inject({ method: 'POST', url: `${BASE}/${target.id}/read`, headers: as('creator') })).statusCode).toBe(200);
        const afterOne = await mine('creator');
        expect(afterOne.unread).toBe(before.unread - 1);
        expect(afterOne.items.find((i) => i.id === target.id)!.read_at).not.toBeNull();

        await app.inject({ method: 'POST', url: `${BASE}/read-all`, headers: as('creator') });
        expect((await mine('creator')).unread).toBe(0);
        expect((await mine('admin')).unread).toBeGreaterThanOrEqual(1);
    });

    it('sem login → 401; id inválido → 400', async () => {
        expect((await app.inject({ method: 'GET', url: BASE })).statusCode).toBe(401);
        expect((await app.inject({ method: 'POST', url: `${BASE}/abc/read`, headers: as('creator') })).statusCode).toBe(400);
    });
});
