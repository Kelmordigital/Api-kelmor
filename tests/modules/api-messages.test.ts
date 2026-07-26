import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { connections, tickets, atendimento_messages, contacts } from '../../src/modules/atendimento/atendimento.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { apiMessagesLog } from '../../src/modules/api-messages/api-messages.db.schema';
import {
    apiMessagesService, ApiMessagesDisabledError, ConnectionNotFoundError,
} from '../../src/modules/api-messages/api-messages.service';
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

describe('apiMessagesService — ciclo de vida da chave', () => {
    it('gera uma chave, resolve a empresa por ela, e revoga invalidando', async () => {
        const { key } = await apiMessagesService.generateKey(companyId);

        const resolved = await apiMessagesService.resolveCompanyByKey(key);
        expect(resolved).toBe(companyId);

        await apiMessagesService.revokeKey(companyId);
        expect(await apiMessagesService.resolveCompanyByKey(key)).toBeNull();
    });

    it('gerar uma nova chave invalida a anterior (só uma chave ativa por empresa)', async () => {
        const first = await apiMessagesService.generateKey(companyId);
        const second = await apiMessagesService.generateKey(companyId);

        expect(await apiMessagesService.resolveCompanyByKey(first.key)).toBeNull();
        expect(await apiMessagesService.resolveCompanyByKey(second.key)).toBe(companyId);
    });

    it('chave inválida não resolve nenhuma empresa', async () => {
        expect(await apiMessagesService.resolveCompanyByKey('chave-inventada')).toBeNull();
    });
});

describe('apiMessagesService.sendMessage — validações', () => {
    it('rejeita quando api_messages está desligado pra empresa', async () => {
        await db.insert(companyPermissions)
            .values({ company_id: otherCompanyId, api_messages: false })
            .onConflictDoUpdate({ target: companyPermissions.company_id, set: { api_messages: false } });

        await expect(
            apiMessagesService.sendMessage(otherCompanyId, {
                connectionId: otherConnectionId, number: '5511999990000', message: 'oi',
            })
        ).rejects.toThrow(ApiMessagesDisabledError);
    });

    it('rejeita quando connection_id não pertence à empresa', async () => {
        await expect(
            apiMessagesService.sendMessage(companyId, {
                connectionId: otherConnectionId, number: '5511999990000', message: 'oi',
            })
        ).rejects.toThrow(ConnectionNotFoundError);
    });
});

describe('apiMessagesService.sendMessage — log sempre, ticket condicional', () => {
    it('com create_ticket_api_msg desligado: grava o log mas não cria ticket', async () => {
        await db.update(companyPermissions)
            .set({ create_ticket_api_msg: false })
            .where(eq(companyPermissions.company_id, companyId));

        const number = `5511${SUFFIX}1`;
        const result = await apiMessagesService.sendMessage(companyId, {
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
        const result = await apiMessagesService.sendMessage(companyId, {
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

        const result = await apiMessagesService.sendMessage(companyId, {
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
        const { key } = await apiMessagesService.generateKey(companyId);
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
            payload: { connection_id: connectionId, number: `5511${SUFFIX}9`, message: 'Via HTTP' },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.sent).toBe(true);
    });
});
