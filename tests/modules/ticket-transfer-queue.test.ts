import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import {
    contacts, connections, queues, tickets, userQueues, userConnections,
} from '../../src/modules/atendimento/atendimento.db.schema';
import { ticketService } from '../../src/modules/atendimento/ticket.service';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let fromUserId: string;
let eligibleUserId: string;
let outsiderUserId: string;
let fallbackUserId: string;
let connectionId: number;
let queueAId: number;
let queueBId: number;
let contactId: number;

beforeAll(async () => {
    await runSeed();
    const [profile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'user'));

    const [co] = await db.insert(companies)
        .values({ name: `Empresa Transfer ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    async function makeUser(label: string) {
        const [u] = await db.insert(users).values({
            name: label, email: `transfer-${label}-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: companyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        return u.id;
    }
    fromUserId = await makeUser('from');
    eligibleUserId = await makeUser('eligible');
    outsiderUserId = await makeUser('outsider');
    fallbackUserId = await makeUser('fallback');

    const [conn] = await db.insert(connections)
        .values({ company_id: companyId, name: 'Conexão Teste' })
        .returning({ id: connections.id });
    connectionId = conn.id;

    const [qa] = await db.insert(queues)
        .values({ company_id: companyId, name: 'Fila A' })
        .returning({ id: queues.id });
    queueAId = qa.id;
    const [qb] = await db.insert(queues)
        .values({ company_id: companyId, name: 'Fila B' })
        .returning({ id: queues.id });
    queueBId = qb.id;

    // eligibleUser: pertence à Fila A e tem acesso à conexão
    await db.insert(userQueues).values({ user_id: eligibleUserId, queue_id: queueAId });
    await db.insert(userConnections).values({ user_id: eligibleUserId, connection_id: connectionId });

    // outsiderUser: pertence só à Fila B (não elegível para a Fila A)
    await db.insert(userQueues).values({ user_id: outsiderUserId, queue_id: queueBId });

    // fallbackUser: pertence à Fila A, sem vínculo de conexão (usado no teste de connection_id nulo)
    await db.insert(userQueues).values({ user_id: fallbackUserId, queue_id: queueAId });

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: 'Contato Transfer' })
        .returning({ id: contacts.id });
    contactId = ct.id;
});

async function openTicket(connId: number | null) {
    const [ticket] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, connection_id: connId,
        status_id: 2, attendant_user_id: fromUserId,
    }).returning();
    return ticket;
}

describe('ticketService.transfer — validação de fila', () => {
    it('transfere com sucesso para um atendente elegível na fila destino', async () => {
        const ticket = await openTicket(connectionId);
        const updated = await ticketService.transfer(ticket.id, fromUserId, eligibleUserId, companyId, queueAId);
        expect(updated.attendant_user_id).toBe(eligibleUserId);
        expect(updated.queue_id).toBe(queueAId);
    });

    it('rejeita transferir para um atendente que não pertence à fila destino', async () => {
        const ticket = await openTicket(connectionId);
        await expect(
            ticketService.transfer(ticket.id, fromUserId, outsiderUserId, companyId, queueAId)
        ).rejects.toThrow('não pertence à fila de destino');
    });

    it('rejeita transferir o ticket para o próprio atendente atual', async () => {
        const ticket = await openTicket(connectionId);
        await expect(
            ticketService.transfer(ticket.id, fromUserId, fromUserId, companyId, queueAId)
        ).rejects.toThrow('mesmo atendente');
    });

    it('sem connection_id no ticket, cai para elegibilidade só por fila', async () => {
        const ticket = await openTicket(null);
        const updated = await ticketService.transfer(ticket.id, fromUserId, fallbackUserId, companyId, queueAId);
        expect(updated.attendant_user_id).toBe(fallbackUserId);
    });
});

describe('PUT /tickets/:id/transfer — validação via HTTP', () => {
    const app = buildApp();
    let fromToken: string;

    beforeAll(async () => {
        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `transfer-from-${SUFFIX}@test.com`, password: 'senha123' },
        });
        fromToken = JSON.parse(login.body).access_token;
    });

    function transferReq(ticketId: number, payload: Record<string, unknown>) {
        return app.inject({
            method: 'PUT', url: `/api/v1/atendimento/tickets/${ticketId}/transfer`,
            headers: { authorization: `Bearer ${fromToken}` },
            payload,
        });
    }

    it('400 quando queueId não é enviado', async () => {
        const ticket = await openTicket(connectionId);
        const res = await transferReq(ticket.id, { attendantId: eligibleUserId });
        expect(res.statusCode).toBe(400);
    });

    it('409 quando o atendente não pertence à fila destino', async () => {
        const ticket = await openTicket(connectionId);
        const res = await transferReq(ticket.id, { attendantId: outsiderUserId, queueId: queueAId });
        expect(res.statusCode).toBe(409);
    });

    it('200 e atualiza o ticket quando o atendente é elegível', async () => {
        const ticket = await openTicket(connectionId);
        const res = await transferReq(ticket.id, { attendantId: eligibleUserId, queueId: queueAId });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.attendant_user_id).toBe(eligibleUserId);
    });
});
