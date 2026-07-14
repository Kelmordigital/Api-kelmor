import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, connections, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { scheduledMessages } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.db.schema';
import { agendamentoMensagensService, TicketSemConexaoError } from '../../src/modules/agendamento-mensagens/agendamento-mensagens.service';
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

    // Regressão: bug real encontrado nesta sessão — sem `{ timezone: 'UTC' }` no
    // node-cron, os campos minuto/hora (calculados via getUTC*()) eram interpretados
    // no fuso LOCAL do servidor (ex.: America/Sao_Paulo, UTC-3), disparando a mensagem
    // ~3h mais tarde do que o agendado. Em vez de esperar o cron real disparar (frágil —
    // cron tem granularidade de minuto, então "poucos segundos no futuro" pode cair
    // dentro do minuto já em curso e só disparar de novo daqui a 1 ano), espiona a
    // chamada a `cron.schedule` e confirma que a opção `timezone: 'UTC'` foi passada,
    // e que os campos da expressão batem com os componentes UTC da data.
    it('agenda o cron em UTC, não no fuso local do servidor', async () => {
        const scheduleSpy = vi.spyOn(cron, 'schedule');
        const sendDate = new Date(Date.now() + 60 * 60 * 1000); // 1h no futuro: garante o caminho de cron, não o de disparo imediato

        await agendamentoMensagensService.create(companyId, ticketWithConnId, userId, {
            message: 'Teste — verifica timezone do cron',
            send_date: sendDate.toISOString(),
        });

        expect(scheduleSpy).toHaveBeenCalled();
        const lastCall = scheduleSpy.mock.calls[scheduleSpy.mock.calls.length - 1];
        const [cronExpr, , options] = lastCall;

        expect(options).toMatchObject({ timezone: 'UTC' });

        const [m, h, d, mo] = String(cronExpr).split(' ').map(Number);
        expect(m).toBe(sendDate.getUTCMinutes());
        expect(h).toBe(sendDate.getUTCHours());
        expect(d).toBe(sendDate.getUTCDate());
        expect(mo).toBe(sendDate.getUTCMonth() + 1);

        scheduleSpy.mockRestore();
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
