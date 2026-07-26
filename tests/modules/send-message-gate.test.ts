import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import {
    contacts, connections, tickets, atendimento_messages,
} from '../../src/modules/atendimento/atendimento.db.schema';
import { buildApp } from '../../src/shared/server';

const SUFFIX = Date.now();
let companyId: string;
let attendantId: string;
let connectionId: number;
let contactId: number;

async function makeTicket(statusId: number) {
    const [ticket] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, connection_id: connectionId,
        status_id: statusId,
    }).returning();
    return ticket;
}

describe('POST /tickets/:id/messages — não deixa "atender" um ticket sem aceitar antes', () => {
    const app = buildApp();
    let token: string;

    beforeAll(async () => {
        const [profile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'user'));

        const [co] = await db.insert(companies)
            .values({ name: `Empresa Gate Msg ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;

        const [u] = await db.insert(users).values({
            name: 'Atendente Gate', email: `gate-msg-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: companyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        attendantId = u.id;

        const [conn] = await db.insert(connections)
            .values({ company_id: companyId, name: 'Conexão Gate', status: 'connected' })
            .returning({ id: connections.id });
        connectionId = conn.id;

        const [ct] = await db.insert(contacts)
            .values({ company_id: companyId, name: 'Contato Gate' })
            .returning({ id: contacts.id });
        contactId = ct.id;

        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `gate-msg-${SUFFIX}@test.com`, password: 'senha123' },
        });
        token = JSON.parse(login.body).access_token;
    });

    function sendReq(ticketId: number, body: Record<string, unknown> = {}) {
        return app.inject({
            method: 'POST', url: `/api/v1/atendimento/tickets/${ticketId}/messages`,
            headers: { authorization: `Bearer ${token}` },
            payload: { body: 'Oii', ...body },
        });
    }

    it('409 ao tentar enviar mensagem (fromMe) num ticket Pendente (status_id=1)', async () => {
        const ticket = await makeTicket(1);
        const res = await sendReq(ticket.id);
        expect(res.statusCode).toBe(409);

        const msgs = await db.select().from(atendimento_messages).where(eq(atendimento_messages.ticket_id, ticket.id));
        expect(msgs).toHaveLength(0);
    });

    it('409 ao tentar enviar mensagem (fromMe) num ticket em Bot (status_id=9)', async () => {
        const ticket = await makeTicket(9);
        const res = await sendReq(ticket.id);
        expect(res.statusCode).toBe(409);
    });

    it('200 depois de aceitar o ticket (status_id=2)', async () => {
        const ticket = await makeTicket(2);
        await db.update(tickets).set({ attendant_user_id: attendantId }).where(eq(tickets.id, ticket.id));

        const res = await sendReq(ticket.id);
        expect(res.statusCode).toBe(200);

        const msgs = await db.select().from(atendimento_messages).where(eq(atendimento_messages.ticket_id, ticket.id));
        expect(msgs).toHaveLength(1);
    });

    it('mensagem inbound (fromMe: false) não é bloqueada mesmo com ticket Pendente', async () => {
        const ticket = await makeTicket(1);
        const res = await sendReq(ticket.id, { fromMe: false });
        expect(res.statusCode).toBe(200);

        const msgs = await db.select().from(atendimento_messages)
            .where(and(eq(atendimento_messages.ticket_id, ticket.id), eq(atendimento_messages.from_me, false)));
        expect(msgs).toHaveLength(1);
    });
});
