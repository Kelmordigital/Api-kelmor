import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets, ticket_spy_log } from '../../src/modules/atendimento/atendimento.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let ownerUserId: string;
let otherUserId: string;
let adminUserId: string;
let contactId: number;

async function setSpyTicket(value: boolean) {
    await db.insert(companyPermissions)
        .values({ company_id: companyId, spy_ticket: value })
        .onConflictDoUpdate({
            target: companyPermissions.company_id,
            set: { spy_ticket: value },
        });
}

async function openTicketOwnedBy(attendantId: string) {
    const [ticket] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId,
        status_id: 2, attendant_user_id: attendantId,
    }).returning();
    return ticket;
}

async function pendingTicket() {
    const [ticket] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId,
        status_id: 1,
    }).returning();
    return ticket;
}

async function countSpyLogs(ticketId: number, userId: string) {
    const rows = await db.select().from(ticket_spy_log)
        .where(eq(ticket_spy_log.ticket_id, ticketId));
    return rows.filter(r => r.user_id === userId).length;
}

beforeAll(async () => {
    const [userProfile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'user'));
    const [adminProfile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'admin'));

    const [co] = await db.insert(companies)
        .values({ name: `Empresa SpyTicket ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    async function makeUser(label: string, profileId: number) {
        const [u] = await db.insert(users).values({
            name: label, email: `spy-ticket-${label}-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profileId, company_id: companyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        return u.id;
    }
    ownerUserId = await makeUser('owner', userProfile.id);
    otherUserId = await makeUser('other', userProfile.id);
    adminUserId = await makeUser('admin', adminProfile.id);

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: `Contato SpyTicket ${SUFFIX}` })
        .returning({ id: contacts.id });
    contactId = ct.id;
});

describe('GET /tickets/:id/messages — ticket Aberta (status 2) de outro atendente', () => {
    const app = buildApp();
    let otherToken: string;
    let adminToken: string;
    let ownerToken: string;

    beforeAll(async () => {
        await app.ready();
        async function login(label: string) {
            const res = await app.inject({
                method: 'POST', url: '/api/v1/auth/login',
                payload: { email: `spy-ticket-${label}-${SUFFIX}@test.com`, password: 'senha123' },
            });
            return JSON.parse(res.body).access_token;
        }
        otherToken = await login('other');
        adminToken = await login('admin');
        ownerToken = await login('owner');
    });

    // "Espiar" não se aplica a ticket já em atendimento por outro — não faz
    // sentido pré-visualizar quem já está sendo atendido de verdade. Bloqueado
    // sempre para quem não é dono nem admin, independente do toggle spy_ticket.
    it('403 mesmo com spy_ticket ligado — atendente comum nunca vê ticket de outro em atendimento', async () => {
        await setSpyTicket(true);
        const ticket = await openTicketOwnedBy(ownerUserId);
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/tickets/${ticket.id}/messages`,
            headers: { authorization: `Bearer ${otherToken}` },
        });
        expect(res.statusCode).toBe(403);
    });

    it('403 com o toggle desligado também', async () => {
        await setSpyTicket(false);
        const ticket = await openTicketOwnedBy(ownerUserId);
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/tickets/${ticket.id}/messages`,
            headers: { authorization: `Bearer ${otherToken}` },
        });
        expect(res.statusCode).toBe(403);
    });

    it('admin sempre pode ver, e registra no log', async () => {
        const ticket = await openTicketOwnedBy(ownerUserId);
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/tickets/${ticket.id}/messages`,
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(await countSpyLogs(ticket.id, adminUserId)).toBe(1);
    });

    it('o dono do ticket vê normalmente, sem registrar no log', async () => {
        const ticket = await openTicketOwnedBy(ownerUserId);
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/tickets/${ticket.id}/messages`,
            headers: { authorization: `Bearer ${ownerToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(await countSpyLogs(ticket.id, ownerUserId)).toBe(0);
    });
});

describe('GET /tickets/:id/messages — ticket Aguardando (status 1), pré-visualização sem aceitar', () => {
    const app = buildApp();
    let otherToken: string;
    let adminToken: string;

    beforeAll(async () => {
        await app.ready();
        async function login(label: string) {
            const res = await app.inject({
                method: 'POST', url: '/api/v1/auth/login',
                payload: { email: `spy-ticket-${label}-${SUFFIX}@test.com`, password: 'senha123' },
            });
            return JSON.parse(res.body).access_token;
        }
        otherToken = await login('other');
        adminToken = await login('admin');
    });

    it('403 quando o toggle está desligado', async () => {
        await setSpyTicket(false);
        const ticket = await pendingTicket();
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/tickets/${ticket.id}/messages`,
            headers: { authorization: `Bearer ${otherToken}` },
        });
        expect(res.statusCode).toBe(403);
    });

    it('200 e registra no log quando o toggle está ligado', async () => {
        await setSpyTicket(true);
        const ticket = await pendingTicket();
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/tickets/${ticket.id}/messages`,
            headers: { authorization: `Bearer ${otherToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(await countSpyLogs(ticket.id, otherUserId)).toBe(1);
    });

    it('admin sempre pode, mesmo com o toggle desligado, e registra no log', async () => {
        await setSpyTicket(false);
        const ticket = await pendingTicket();
        const res = await app.inject({
            method: 'GET', url: `/api/v1/atendimento/tickets/${ticket.id}/messages`,
            headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        expect(await countSpyLogs(ticket.id, adminUserId)).toBe(1);
    });
});

describe('POST /tickets/:id/messages — nunca permite enviar em ticket de outro atendente', () => {
    const app = buildApp();
    let otherToken: string;
    let adminToken: string;

    beforeAll(async () => {
        await app.ready();
        async function login(label: string) {
            const res = await app.inject({
                method: 'POST', url: '/api/v1/auth/login',
                payload: { email: `spy-ticket-${label}-${SUFFIX}@test.com`, password: 'senha123' },
            });
            return JSON.parse(res.body).access_token;
        }
        otherToken = await login('other');
        adminToken = await login('admin');
    });

    it('403 mesmo com spy_ticket ligado — espiar nunca dá direito de responder', async () => {
        await setSpyTicket(true);
        const ticket = await openTicketOwnedBy(ownerUserId);
        const res = await app.inject({
            method: 'POST', url: `/api/v1/atendimento/tickets/${ticket.id}/messages`,
            headers: { authorization: `Bearer ${otherToken}` },
            payload: { body: 'oi' },
        });
        expect(res.statusCode).toBe(403);
    });

    it('admin pode enviar em qualquer ticket', async () => {
        const ticket = await openTicketOwnedBy(ownerUserId);
        const res = await app.inject({
            method: 'POST', url: `/api/v1/atendimento/tickets/${ticket.id}/messages`,
            headers: { authorization: `Bearer ${adminToken}` },
            payload: { body: 'oi' },
        });
        expect(res.statusCode).toBe(200);
    });
});
