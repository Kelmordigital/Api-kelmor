import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';
import { ticketAssignment } from '../../src/modules/atendimento/atendimento.module';

const SUFFIX = Date.now();
let companyId: string;
let attendantUserId: string;
let adminUserId: string;
let contactSeq = 0;

async function setReturnTicket(value: boolean) {
    await db.insert(companyPermissions)
        .values({ company_id: companyId, return_ticket: value })
        .onConflictDoUpdate({
            target: companyPermissions.company_id,
            set: { return_ticket: value },
        });
}

// cada teste usa seu próprio contato — reopen() rejeita se já existir outro
// ticket aberto para o mesmo contato, então contatos compartilhados entre
// testes causariam falso-negativo dependendo da ordem de execução.
async function newContact() {
    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: `Contato ReturnTicket ${SUFFIX}-${contactSeq++}` })
        .returning({ id: contacts.id });
    return ct.id;
}

async function openTicket(attendantId: string) {
    const [ticket] = await db.insert(tickets).values({
        company_id: companyId, contact_id: await newContact(),
        status_id: 2, attendant_user_id: attendantId,
    }).returning();
    return ticket;
}

async function closedTicket(attendantId: string) {
    const [ticket] = await db.insert(tickets).values({
        company_id: companyId, contact_id: await newContact(),
        status_id: 3, attendant_user_id: attendantId, closed_by_user_id: attendantId,
    }).returning();
    return ticket;
}

beforeAll(async () => {
    await runSeed();
    const [userProfile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'user'));
    const [adminProfile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'admin'));

    const [co] = await db.insert(companies)
        .values({ name: `Empresa ReturnTicket ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    async function makeUser(label: string, profileId: number) {
        const [u] = await db.insert(users).values({
            name: label, email: `return-ticket-${label}-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profileId, company_id: companyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        return u.id;
    }
    attendantUserId = await makeUser('atendente', userProfile.id);
    adminUserId = await makeUser('admin', adminProfile.id);
});

describe('ticketAssignment.returnToQueue — permissão return_ticket', () => {
    it('rejeita atendente comum quando o toggle está desligado', async () => {
        await setReturnTicket(false);
        const ticket = await openTicket(attendantUserId);
        await expect(
            ticketAssignment.returnToQueue(ticket.id, attendantUserId, companyId, 'user')
        ).rejects.toThrow('administrador');
    });

    it('permite atendente comum quando o toggle está ligado', async () => {
        await setReturnTicket(true);
        const ticket = await openTicket(attendantUserId);
        const updated = await ticketAssignment.returnToQueue(ticket.id, attendantUserId, companyId, 'user');
        expect(updated.status_id).toBe(1);
        expect(updated.attendant_user_id).toBeNull();
    });

    it('admin sempre pode devolver, mesmo com o toggle desligado', async () => {
        await setReturnTicket(false);
        const ticket = await openTicket(attendantUserId);
        const updated = await ticketAssignment.returnToQueue(ticket.id, adminUserId, companyId, 'admin');
        expect(updated.status_id).toBe(1);
    });
});

describe('ticketAssignment.reopen — permissão return_ticket', () => {
    it('rejeita atendente comum quando o toggle está desligado', async () => {
        await setReturnTicket(false);
        const ticket = await closedTicket(attendantUserId);
        await expect(
            ticketAssignment.reopen(ticket.id, attendantUserId, companyId, 'user')
        ).rejects.toThrow('administrador');
    });

    it('permite atendente comum quando o toggle está ligado', async () => {
        await setReturnTicket(true);
        const ticket = await closedTicket(attendantUserId);
        const updated = await ticketAssignment.reopen(ticket.id, attendantUserId, companyId, 'user');
        expect(updated.status_id).toBe(2);
        expect(updated.attendant_user_id).toBe(attendantUserId);
    });

    it('admin sempre pode reabrir, mesmo com o toggle desligado', async () => {
        await setReturnTicket(false);
        const ticket = await closedTicket(attendantUserId);
        const updated = await ticketAssignment.reopen(ticket.id, adminUserId, companyId, 'admin');
        expect(updated.status_id).toBe(2);
    });
});

describe('PUT /tickets/:id/return e /reopen — 403 via HTTP quando sem permissão', () => {
    const app = buildApp();
    let attendantToken: string;

    beforeAll(async () => {
        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `return-ticket-atendente-${SUFFIX}@test.com`, password: 'senha123' },
        });
        attendantToken = JSON.parse(login.body).access_token;
    });

    it('403 ao devolver sem permissão', async () => {
        await setReturnTicket(false);
        const ticket = await openTicket(attendantUserId);
        const res = await app.inject({
            method: 'PUT', url: `/api/v1/atendimento/tickets/${ticket.id}/return`,
            headers: { authorization: `Bearer ${attendantToken}` },
        });
        expect(res.statusCode).toBe(403);
    });

    it('403 ao reabrir sem permissão', async () => {
        await setReturnTicket(false);
        const ticket = await closedTicket(attendantUserId);
        const res = await app.inject({
            method: 'PUT', url: `/api/v1/atendimento/tickets/${ticket.id}/reopen`,
            headers: { authorization: `Bearer ${attendantToken}` },
        });
        expect(res.statusCode).toBe(403);
    });
});
