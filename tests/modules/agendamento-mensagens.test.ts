import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, connections, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { scheduledMessages } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.db.schema';
import { TicketSemConexaoError, ScheduledMessageDispatcher } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.service';
import { agendamentoMensagensService } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.module';
import { DrizzleScheduledMessageRepository } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.repository';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let userId: string;
let contactId: number;
let connectionId: number;
let ticketWithConnId: number;
let ticketWithoutConnId: number;

beforeAll(async () => {
    await runSeed();
    const [profile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'user'));

    const [co] = await db.insert(companies)
        .values({ name: `Empresa Agendamento ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [u] = await db.insert(users).values({
        name: 'Atendente Agendamento', email: `agendamento-${SUFFIX}@test.com`,
        password_hash: hashSync('senha123', 10),
        profile_id: profile.id, company_id: companyId,
        email_verified: true, is_approved: true,
    }).returning({ id: users.id });
    userId = u.id;

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: 'Contato Agendamento', number: '5511999990000' })
        .returning({ id: contacts.id });
    contactId = ct.id;

    const [conn] = await db.insert(connections)
        .values({ company_id: companyId, name: 'Conexão Teste', status: 'disconnected' })
        .returning({ id: connections.id });
    connectionId = conn.id;

    const [t1] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, connection_id: connectionId, status_id: 2,
    }).returning({ id: tickets.id });
    ticketWithConnId = t1.id;

    const [t2] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, connection_id: null, status_id: 2,
    }).returning({ id: tickets.id });
    ticketWithoutConnId = t2.id;
});

describe('agendamentoMensagensService.create', () => {
    it('agenda uma mensagem futura para o contato do ticket', async () => {
        const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const row = await agendamentoMensagensService.create(companyId, ticketWithConnId, userId, {
            message: 'Olá, tudo bem?',
            send_date: futureDate,
        });

        expect(row.status).toBe('scheduled');
        expect(row.contact_id).toBe(contactId);
        expect(row.connection_id).toBe(connectionId);
        expect(row.ticket_id).toBe(ticketWithConnId);
        expect(row.created_by).toBe(userId);
    });

    it('rejeita ticket sem conexão associada', async () => {
        const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await expect(
            agendamentoMensagensService.create(companyId, ticketWithoutConnId, userId, {
                message: 'Olá',
                send_date: futureDate,
            })
        ).rejects.toBeInstanceOf(TicketSemConexaoError);
    });

    it('rejeita ticket inexistente', async () => {
        const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await expect(
            agendamentoMensagensService.create(companyId, 999999999, userId, {
                message: 'Olá',
                send_date: futureDate,
            })
        ).rejects.toThrow('Ticket não encontrado');
    });
});

describe('ScheduledMessageDispatcher — envio das mensagens vencidas', () => {
    const repository = new DrizzleScheduledMessageRepository(db);

    async function schedule(sendDate: Date, overrides: Partial<typeof scheduledMessages.$inferInsert> = {}) {
        const [row] = await db.insert(scheduledMessages).values({
            company_id: companyId, ticket_id: ticketWithConnId, contact_id: contactId, connection_id: connectionId,
            created_by: userId, message: `Disparo ${Math.random()}`, send_date: sendDate, ...overrides,
        }).returning();
        return row;
    }
    const statusOf = async (id: number) => (await db.select().from(scheduledMessages).where(eq(scheduledMessages.id, id)))[0];

    it('envia o que venceu pela conexão do ticket e marca como enviado; o futuro fica', async () => {
        const due = await schedule(new Date(Date.now() - 60_000));
        const future = await schedule(new Date(Date.now() + 3600_000));
        const sent: unknown[][] = [];
        const dispatcher = new ScheduledMessageDispatcher(repository, { sendText: async (...args) => { sent.push(args); } });

        await dispatcher.dispatchDue();

        expect(sent).toContainEqual([connectionId, '5511999990000', due.message]);
        expect(sent.some((args) => args[2] === future.message)).toBe(false);
        expect(await statusOf(due.id)).toMatchObject({ status: 'sent' });
        expect((await statusOf(due.id)).sent_at).not.toBeNull();
        expect((await statusOf(future.id)).status).toBe('scheduled');
    });

    it('duas instâncias disparando ao mesmo tempo enviam cada mensagem uma vez só', async () => {
        const due = await schedule(new Date(Date.now() - 1000));
        let sends = 0;
        const sender = { sendText: async (_c: number, _t: string, text: string) => {
            if (text === due.message) sends++;
            await new Promise((r) => setTimeout(r, 50));
        } };
        await Promise.all([
            new ScheduledMessageDispatcher(repository, sender).dispatchDue(),
            new ScheduledMessageDispatcher(repository, sender).dispatchDue(),
        ]);
        expect(sends).toBe(1);
    });

    it('falha no envio fica registrada; agendamento apagado não é enviado', async () => {
        const failing = await schedule(new Date(Date.now() - 1000));
        const deleted = await schedule(new Date(Date.now() - 1000), { deleted_at: new Date() });
        const dispatcher = new ScheduledMessageDispatcher(repository, { sendText: async () => { throw new Error('conexão caiu'); } });

        await dispatcher.dispatchDue();

        expect(await statusOf(failing.id)).toMatchObject({ status: 'failed', last_error: 'conexão caiu' });
        expect((await statusOf(deleted.id)).status).toBe('scheduled');
    });

    it('envio preso em "sending" há mais de 10 minutos é dado como falho (nunca reenviado)', async () => {
        const stuck = await schedule(new Date(Date.now() - 3600_000), { status: 'sending', updated_at: new Date(Date.now() - 11 * 60_000) });
        let resent = false;
        await new ScheduledMessageDispatcher(repository, { sendText: async (_c, _t, text) => { if (text === stuck.message) resent = true; } }).dispatchDue();
        expect(resent).toBe(false);
        expect((await statusOf(stuck.id)).status).toBe('failed');
    });
});

describe('POST /tickets/:id/schedule-message — validação via HTTP', () => {
    const app = buildApp();
    let token: string;

    beforeAll(async () => {
        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `agendamento-${SUFFIX}@test.com`, password: 'senha123' },
        });
        token = JSON.parse(login.body).access_token;
    });

    afterAll(async () => { await app.close(); });

    it('400 quando message está ausente', async () => {
        const res = await app.inject({
            method: 'POST', url: `/api/v1/atendimento/tickets/${ticketWithConnId}/schedule-message`,
            headers: { authorization: `Bearer ${token}` },
            payload: { send_date: new Date(Date.now() + 3600_000).toISOString() },
        });
        expect(res.statusCode).toBe(400);
    });

    it('400 quando o ticket não tem conexão', async () => {
        const res = await app.inject({
            method: 'POST', url: `/api/v1/atendimento/tickets/${ticketWithoutConnId}/schedule-message`,
            headers: { authorization: `Bearer ${token}` },
            payload: { message: 'Olá', send_date: new Date(Date.now() + 3600_000).toISOString() },
        });
        expect(res.statusCode).toBe(400);
    });

    it('404 para ticket inexistente (antes: 500); 400 para data inválida', async () => {
        const missing = await app.inject({
            method: 'POST', url: '/api/v1/atendimento/tickets/999999999/schedule-message',
            headers: { authorization: `Bearer ${token}` },
            payload: { message: 'Olá', send_date: new Date(Date.now() + 3600_000).toISOString() },
        });
        expect(missing.statusCode).toBe(404);
        expect(JSON.parse(missing.body).error).toBe('Ticket não encontrado');

        const badDate = await app.inject({
            method: 'POST', url: `/api/v1/atendimento/tickets/${ticketWithConnId}/schedule-message`,
            headers: { authorization: `Bearer ${token}` },
            payload: { message: 'Olá', send_date: 'semana que vem' },
        });
        expect(badDate.statusCode).toBe(400);
        expect(JSON.parse(badDate.body).error).toBe('send_date inválido');
    });

    it('201 e grava no banco quando os dados são válidos', async () => {
        const sendDate = new Date(Date.now() + 3600_000).toISOString();
        const res = await app.inject({
            method: 'POST', url: `/api/v1/atendimento/tickets/${ticketWithConnId}/schedule-message`,
            headers: { authorization: `Bearer ${token}` },
            payload: { message: 'Mensagem agendada via HTTP', send_date: sendDate },
        });
        expect(res.statusCode).toBe(201);
        const body = JSON.parse(res.body);

        const [saved] = await db.select().from(scheduledMessages).where(eq(scheduledMessages.id, body.id));
        expect(saved.message).toBe('Mensagem agendada via HTTP');
        expect(saved.status).toBe('scheduled');
    });
});

describe('PUT/DELETE /scheduled-messages/:id — editar e cancelar antes do envio', () => {
    const app = buildApp();
    let token: string;
    let otherToken: string;

    beforeAll(async () => {
        await app.ready();
        const login = async (email: string) => JSON.parse((await app.inject({
            method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'senha123' },
        })).body).access_token as string;
        token = await login(`agendamento-${SUFFIX}@test.com`);

        const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [other] = await db.insert(companies).values({ name: `Outra Agendamento ${SUFFIX}`, status: true }).returning({ id: companies.id });
        await db.insert(users).values({
            name: 'Outro', email: `agendamento-outro-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: other.id, email_verified: true, is_approved: true,
        });
        otherToken = await login(`agendamento-outro-${SUFFIX}@test.com`);
    });

    afterAll(async () => { await app.close(); });

    const scheduleOne = async () => {
        const res = await app.inject({
            method: 'POST', url: `/api/v1/atendimento/tickets/${ticketWithConnId}/schedule-message`,
            headers: { authorization: `Bearer ${token}` },
            payload: { message: 'Original', send_date: new Date(Date.now() + 3600_000).toISOString() },
        });
        return JSON.parse(res.body) as { id: number };
    };
    const call = (method: 'PUT' | 'DELETE', id: number | string, payload?: object, t = token) =>
        app.inject({ method, url: `/api/v1/atendimento/scheduled-messages/${id}`, headers: { authorization: `Bearer ${t}` }, ...(payload ? { payload } : {}) });

    it('edita mensagem e data enquanto aguarda envio', async () => {
        const { id } = await scheduleOne();
        const newDate = new Date(Date.now() + 2 * 3600_000).toISOString();
        const res = await call('PUT', id, { message: '  Editada  ', send_date: newDate });
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toMatchObject({ id, message: 'Editada', status: 'scheduled' });
        const [row] = await db.select().from(scheduledMessages).where(eq(scheduledMessages.id, id));
        expect(row.send_date.toISOString()).toBe(newDate);
    });

    it('cancela: fica no histórico como cancelada e não é enviada', async () => {
        const { id } = await scheduleOne();
        const res = await call('DELETE', id);
        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body).status).toBe('canceled');

        await db.update(scheduledMessages).set({ send_date: new Date(Date.now() - 1000) }).where(eq(scheduledMessages.id, id));
        let sent = false;
        await new ScheduledMessageDispatcher(new DrizzleScheduledMessageRepository(db), { sendText: async () => { sent = true; } }).dispatchDue();
        expect(sent).toBe(false);
    });

    it('depois de enviada (ou cancelada) não pode mais editar nem cancelar → 409', async () => {
        const { id } = await scheduleOne();
        await db.update(scheduledMessages).set({ status: 'sent' }).where(eq(scheduledMessages.id, id));
        for (const res of [await call('PUT', id, { message: 'x' }), await call('DELETE', id)]) {
            expect(res.statusCode).toBe(409);
            expect(JSON.parse(res.body).error).toBe('Esta mensagem não pode mais ser alterada: ela já foi enviada, cancelada ou está sendo enviada.');
        }
    });

    it('de outra empresa ou inexistente → 404; corpo vazio ou data inválida → 400', async () => {
        const { id } = await scheduleOne();
        expect((await call('PUT', id, { message: 'x' }, otherToken)).statusCode).toBe(404);
        expect((await call('DELETE', id, undefined, otherToken)).statusCode).toBe(404);
        expect(JSON.parse((await call('DELETE', 999999999)).body).error).toBe('Agendamento não encontrado');
        expect(JSON.parse((await call('PUT', id, {})).body).error).toBe('Envie a mensagem e/ou a nova data');
        expect(JSON.parse((await call('PUT', id, { send_date: 'amanhã' })).body).error).toBe('send_date inválido');
        expect((await call('PUT', 'abc', { message: 'x' })).statusCode).toBe(400);
    });
});

describe('GET /tickets/:id/scheduled-messages — histórico por contato', () => {
    const app = buildApp();
    let token: string;
    let secondTicketSameContactId: number;
    let otherContactTicketId: number;

    beforeAll(async () => {
        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `agendamento-${SUFFIX}@test.com`, password: 'senha123' },
        });
        token = JSON.parse(login.body).access_token;

        // Segundo ticket do MESMO contato (histórico deve juntar os dois)
        const [t] = await db.insert(tickets).values({
            company_id: companyId, contact_id: contactId, connection_id: connectionId, status_id: 3,
        }).returning({ id: tickets.id });
        secondTicketSameContactId = t.id;

        // Ticket de OUTRO contato (não deve aparecer no histórico do primeiro)
        const [otherContact] = await db.insert(contacts)
            .values({ company_id: companyId, name: 'Outro Contato', number: '5511988880000' })
            .returning({ id: contacts.id });
        const [t2] = await db.insert(tickets).values({
            company_id: companyId, contact_id: otherContact.id, connection_id: connectionId, status_id: 2,
        }).returning({ id: tickets.id });
        otherContactTicketId = t2.id;

        await agendamentoMensagensService.create(companyId, ticketWithConnId, userId, {
            message: 'Primeira mensagem agendada', send_date: new Date(Date.now() + 3600_000).toISOString(),
        });
        await agendamentoMensagensService.create(companyId, secondTicketSameContactId, userId, {
            message: 'Segunda mensagem, ticket diferente, mesmo contato', send_date: new Date(Date.now() + 7200_000).toISOString(),
        });
        await agendamentoMensagensService.create(companyId, otherContactTicketId, userId, {
            message: 'Mensagem de outro contato', send_date: new Date(Date.now() + 3600_000).toISOString(),
        });
    });

    afterAll(async () => { await app.close(); });

    it('lista agendamentos do contato juntando tickets diferentes, sem misturar outro contato', async () => {
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/tickets/${ticketWithConnId}/scheduled-messages`,
            headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body) as { message: string; contact_id: number }[];

        const messages = body.map((r) => r.message);
        expect(messages).toContain('Primeira mensagem agendada');
        expect(messages).toContain('Segunda mensagem, ticket diferente, mesmo contato');
        expect(messages).not.toContain('Mensagem de outro contato');
        expect(body.every((r) => r.contact_id === contactId)).toBe(true);
    });
});
