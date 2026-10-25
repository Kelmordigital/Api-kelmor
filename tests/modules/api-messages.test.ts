import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { connections, tickets, atendimento_messages, contacts } from '../../src/modules/atendimento/atendimento.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { apiMessagesLog } from '../../src/modules/api-messages/api-messages.db.schema';
import { ApiMessagesDisabledError, ConnectionNotFoundError } from '../../src/modules/api-messages/api-messages.service';
import { apiKeyService, apiMessageService } from '../../src/modules/api-messages/api-messages.module';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let otherCompanyId: string;
let connectionId: number;
let otherConnectionId: number;

beforeAll(async () => {
    const [co] = await db.insert(companies)
        .values({ name: `Empresa API Msgs ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [otherCo] = await db.insert(companies)
        .values({ name: `Empresa Outra ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    otherCompanyId = otherCo.id;

    const [conn] = await db.insert(connections)
        .values({ company_id: companyId, name: 'Conexão API', status: 'connected', type: 'whatsapp' })
        .returning({ id: connections.id });
    connectionId = conn.id;

    const [otherConn] = await db.insert(connections)
        .values({ company_id: otherCompanyId, name: 'Conexão Outra Empresa', status: 'connected', type: 'whatsapp' })
        .returning({ id: connections.id });
    otherConnectionId = otherConn.id;

    await db.insert(companyPermissions)
        .values({ company_id: companyId, api_messages: true, create_ticket_api_msg: true })
        .onConflictDoUpdate({
            target: companyPermissions.company_id,
            set: { api_messages: true, create_ticket_api_msg: true },
        });
});

// baysPost usa global.fetch internamente — mockar aqui evita depender de um
// serviço bays real rodando, igual ao padrão já usado em whatsapp-bays.test.ts.
const originalFetch = global.fetch;
beforeEach(() => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe('ApiKeyService — ciclo de vida da chave', () => {
    it('gera uma chave, resolve a empresa por ela, e revoga invalidando', async () => {
        const { key } = await apiKeyService.generateKey(companyId);

        const resolved = await apiKeyService.resolveCompanyByKey(key);
        expect(resolved).toBe(companyId);

        await apiKeyService.revokeKey(companyId);
        expect(await apiKeyService.resolveCompanyByKey(key)).toBeNull();
    });

    it('gerar uma nova chave invalida a anterior (só uma chave ativa por empresa)', async () => {
        const first = await apiKeyService.generateKey(companyId);
        const second = await apiKeyService.generateKey(companyId);

        expect(await apiKeyService.resolveCompanyByKey(first.key)).toBeNull();
        expect(await apiKeyService.resolveCompanyByKey(second.key)).toBe(companyId);
    });

    it('chave inválida não resolve nenhuma empresa', async () => {
        expect(await apiKeyService.resolveCompanyByKey('chave-inventada')).toBeNull();
    });
});

describe('ApiMessageService.sendMessage — validações', () => {
    it('rejeita quando api_messages está desligado pra empresa', async () => {
        await db.insert(companyPermissions)
            .values({ company_id: otherCompanyId, api_messages: false })
            .onConflictDoUpdate({ target: companyPermissions.company_id, set: { api_messages: false } });

        await expect(
            apiMessageService.sendMessage(otherCompanyId, {
                connectionId: otherConnectionId, number: '5511999990000', message: 'oi',
            })
        ).rejects.toThrow(ApiMessagesDisabledError);
    });

    it('rejeita quando connection_id não pertence à empresa', async () => {
        await expect(
            apiMessageService.sendMessage(companyId, {
                connectionId: otherConnectionId, number: '5511999990000', message: 'oi',
            })
        ).rejects.toThrow(ConnectionNotFoundError);
    });
});

describe('ApiMessageService.sendMessage — log sempre, ticket condicional', () => {
    it('com create_ticket_api_msg desligado: grava o log mas não cria ticket', async () => {
        await db.update(companyPermissions)
            .set({ create_ticket_api_msg: false })
            .where(eq(companyPermissions.company_id, companyId));

        const number = `5511${SUFFIX}1`;
        const result = await apiMessageService.sendMessage(companyId, {
            connectionId, number, message: 'Seu pedido foi enviado',
        });
        expect(result.ticketId).toBeNull();

        const [log] = await db.select().from(apiMessagesLog)
            .where(and(eq(apiMessagesLog.company_id, companyId), eq(apiMessagesLog.to_number, number)));
        expect(log).toBeTruthy();
        expect(log.ticket_id).toBeNull();
        expect(log.body).toBe('Seu pedido foi enviado');

        const [contact] = await db.select().from(contacts)
            .where(and(eq(contacts.company_id, companyId), eq(contacts.number, number)));
        expect(contact).toBeUndefined();
    });

    it('com create_ticket_api_msg ligado e sem ticket aberto: cria ticket fechado, sem atendente', async () => {
        await db.update(companyPermissions)
            .set({ create_ticket_api_msg: true })
            .where(eq(companyPermissions.company_id, companyId));

        const number = `5511${SUFFIX}2`;
        const result = await apiMessageService.sendMessage(companyId, {
            connectionId, number, message: 'Seu pedido #123 saiu para entrega',
        });
        expect(result.ticketId).not.toBeNull();

        const [ticket] = await db.select().from(tickets).where(eq(tickets.id, result.ticketId!));
        expect(ticket.status_id).toBe(3);
        expect(ticket.attendant_user_id).toBeNull();
        expect(ticket.closed_by_user_id).toBeNull();
        expect(ticket.connection_id).toBe(connectionId);

        const msgs = await db.select().from(atendimento_messages).where(eq(atendimento_messages.ticket_id, ticket.id));
        expect(msgs).toHaveLength(1);
        expect(msgs[0].body).toBe('Seu pedido #123 saiu para entrega');
        expect(msgs[0].from_me).toBe(true);

        const [log] = await db.select().from(apiMessagesLog)
            .where(and(eq(apiMessagesLog.company_id, companyId), eq(apiMessagesLog.to_number, number)));
        expect(log.ticket_id).toBe(ticket.id);
    });

    it('reaproveita um ticket já aberto na mesma conexão em vez de criar outro', async () => {
        const number = `5511${SUFFIX}3`;
        const [contact] = await db.insert(contacts)
            .values({ company_id: companyId, name: 'Contato Aberto', number })
            .returning();
        const [openTicket] = await db.insert(tickets).values({
            company_id: companyId, contact_id: contact.id, connection_id: connectionId, status_id: 2,
        }).returning();

        const result = await apiMessageService.sendMessage(companyId, {
            connectionId, number, message: 'Complemento da conversa em aberto',
        });

        expect(result.ticketId).toBe(openTicket.id);
        const [reloaded] = await db.select().from(tickets).where(eq(tickets.id, openTicket.id));
        expect(reloaded.status_id).toBe(2); // não fecha nem mexe no ticket em atendimento

        const msgs = await db.select().from(atendimento_messages).where(eq(atendimento_messages.ticket_id, openTicket.id));
        expect(msgs.some(m => m.body === 'Complemento da conversa em aberto')).toBe(true);
    });
});

describe('POST /api-messages/send — autenticação via HTTP', () => {
    const app = buildApp();
    let apiKey: string;

    beforeAll(async () => {
        await app.ready();
        const { key } = await apiKeyService.generateKey(companyId);
        apiKey = key;
        await db.update(companyPermissions)
            .set({ api_messages: true, create_ticket_api_msg: false })
            .where(eq(companyPermissions.company_id, companyId));
    });

    it('401 sem X-Api-Key', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/api-messages/send',
            payload: { connection_id: connectionId, number: '5511999990000', message: 'oi' },
        });
        expect(res.statusCode).toBe(401);
    });

    it('401 com X-Api-Key inválida', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/api-messages/send',
            headers: { 'x-api-key': 'chave-errada' },
            payload: { connection_id: connectionId, number: '5511999990000', message: 'oi' },
        });
        expect(res.statusCode).toBe(401);
    });

    it('400 quando falta campo obrigatório', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/api-messages/send',
            headers: { 'x-api-key': apiKey },
            payload: { connection_id: connectionId, message: 'oi' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('200 com chave válida e corpo completo', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/v1/api-messages/send',
            headers: { 'x-api-key': apiKey },
            payload: { connection_id: connectionId, number: `55119${String(SUFFIX).slice(-8)}`, message: 'Via HTTP' },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.sent).toBe(true);
    });
});

describe('POST /api-messages/send — contrato da API pública', () => {
    const app = buildApp();
    let apiKey: string;
    const send = (payload: object, key = apiKey) =>
        app.inject({ method: 'POST', url: '/api/v1/api-messages/send', headers: { 'x-api-key': key }, payload });

    beforeAll(async () => {
        await app.ready();
        apiKey = (await apiKeyService.generateKey(companyId)).key;
        await db.update(companyPermissions)
            .set({ api_messages: true, create_ticket_api_msg: false })
            .where(eq(companyPermissions.company_id, companyId));
    });

    it('erros saem no formato { statusCode, error, message }', async () => {
        const noKey = await app.inject({ method: 'POST', url: '/api/v1/api-messages/send', payload: {} });
        expect(JSON.parse(noKey.body)).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Chave de API não fornecida' });

        const badKey = await send({}, 'kelmor_invalida');
        expect(JSON.parse(badKey.body)).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Chave de API inválida ou revogada' });

        const missing = await send({ connection_id: connectionId, message: 'oi' });
        expect(JSON.parse(missing.body)).toEqual({ statusCode: 400, error: 'Bad Request', message: 'connection_id, number e message são obrigatórios' });

        const foreign = await send({ connection_id: otherConnectionId, number: '5511999998888', message: 'oi' });
        expect(foreign.statusCode).toBe(404);
        expect(JSON.parse(foreign.body)).toEqual({ statusCode: 404, error: 'Not Found', message: 'Conexão não encontrada para esta empresa' });
    });

    it('API desligada para a empresa → 403 no mesmo formato', async () => {
        await db.update(companyPermissions).set({ api_messages: false }).where(eq(companyPermissions.company_id, companyId));
        const res = await send({ connection_id: connectionId, number: '5511999998888', message: 'oi' });
        expect(res.statusCode).toBe(403);
        expect(JSON.parse(res.body)).toEqual({ statusCode: 403, error: 'Forbidden', message: 'Envio de mensagens via API está desativado para esta empresa' });
        await db.update(companyPermissions).set({ api_messages: true }).where(eq(companyPermissions.company_id, companyId));
    });

    it('número é gravado só com dígitos', async () => {
        const res = await send({ connection_id: connectionId, number: '+55 (11) 98888-7777', message: `Formatado ${SUFFIX}` });
        expect(res.statusCode).toBe(200);
        const [log] = await db.select().from(apiMessagesLog).where(eq(apiMessagesLog.body, `Formatado ${SUFFIX}`));
        expect(log.to_number).toBe('5511988887777');
    });

    it.each([
        [{ connection_id: 'abc', number: '5511999998888', message: 'oi' }, 'connection_id inválido'],
        [{ connection_id: 1, number: 'abc', message: 'oi' },               'number inválido'],
        [{ connection_id: 1, number: '123', message: 'oi' },               'number inválido'],
        [{ connection_id: 1, number: '5511999998888', message: '   ' },    'connection_id, number e message são obrigatórios'],
    ])('400 para %j (antes alguns davam 500)', async (payload, message) => {
        const res = await send(payload);
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body)).toEqual({ statusCode: 400, error: 'Bad Request', message });
    });

    it('falha ao enviar pela conexão → 502 (antes: 500), sem log de envio', async () => {
        global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'offline' }), { status: 500 })) as unknown as typeof fetch;
        const res = await send({ connection_id: connectionId, number: '5511977776666', message: `Falha ${SUFFIX}` });
        expect(res.statusCode).toBe(502);
        expect(JSON.parse(res.body)).toMatchObject({ statusCode: 502, error: 'Bad Gateway' });
        expect(await db.select().from(apiMessagesLog).where(eq(apiMessagesLog.body, `Falha ${SUFFIX}`))).toHaveLength(0);
    });
});

describe('Gestão da chave pelo superAdmin (sem empresa)', () => {
    const app = buildApp();
    beforeAll(async () => { await app.ready(); });

    it('superAdmin não tem chave da empresa → 403 (antes: 500)', async () => {
        const { runSeed } = await import('../../src/database/seed');
        await runSeed();
        const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'filipe@kelmor.com', password: 'kelmor123' } });
        const token = JSON.parse(login.body).access_token;
        const res = await app.inject({ method: 'POST', url: '/api/v1/company-api-keys/generate', headers: { authorization: `Bearer ${token}` } });
        expect(res.statusCode).toBe(403);
    });
});

