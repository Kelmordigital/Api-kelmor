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
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { ticketService } from '../../src/modules/atendimento/ticket.service';
import { getActiveTicketCounts, filterByCapacity, AttendantLimitReachedError } from '../../src/modules/atendimento/attendant-capacity.service';
import { runSeed } from '../../src/database/seed';

const SUFFIX = Date.now();
let companyId: string;
let attendantId: string;      // usado nos testes de contagem/filtro/reopen — fica travado no teto (1/1)
let otherAttendantId: string;  // "from" nos testes de transfer, nunca é destino
let freeAttendantId: string;   // destino "com vaga" no teste de transfer — nunca ganha ticket antes da hora
let connectedConnId: number;
let disconnectedConnId: number;
let queueId: number;

beforeAll(async () => {
    await runSeed();
    const [profile] = await db.select({ id: profiles.id })
        .from(profiles).where(eq(profiles.tag, 'user'));

    const [co] = await db.insert(companies)
        .values({ name: `Empresa Capacidade ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    await db.insert(companyPermissions)
        .values({ company_id: companyId, limit_services_users: true, number_limit_services_users: 1 })
        .onConflictDoUpdate({
            target: companyPermissions.company_id,
            set: { limit_services_users: true, number_limit_services_users: 1 },
        });

    async function makeUser(label: string) {
        const [u] = await db.insert(users).values({
            name: label, email: `capacidade-${label}-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: companyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        return u.id;
    }
    attendantId = await makeUser('atendente');
    otherAttendantId = await makeUser('origem');
    freeAttendantId = await makeUser('livre');

    const [connOk] = await db.insert(connections)
        .values({ company_id: companyId, name: 'Conexão Ativa', status: 'connected' })
        .returning({ id: connections.id });
    connectedConnId = connOk.id;

    const [connDown] = await db.insert(connections)
        .values({ company_id: companyId, name: 'Conexão Caída', status: 'disconnected' })
        .returning({ id: connections.id });
    disconnectedConnId = connDown.id;

    const [q] = await db.insert(queues)
        .values({ company_id: companyId, name: 'Fila Capacidade' })
        .returning({ id: queues.id });
    queueId = q.id;

    // Todos elegíveis pra fila+conexão — só a checagem de teto deve diferenciá-los.
    for (const uid of [attendantId, otherAttendantId, freeAttendantId]) {
        await db.insert(userQueues).values({ user_id: uid, queue_id: queueId });
        await db.insert(userConnections).values({ user_id: uid, connection_id: connectedConnId });
    }
});

async function makeContact(label: string) {
    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: label })
        .returning({ id: contacts.id });
    return ct.id;
}

async function openTicketFor(userId: string, connId: number | null, statusId = 2) {
    const contactId = await makeContact(`contato-${Date.now()}-${Math.random()}`);
    const [ticket] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, connection_id: connId,
        status_id: statusId, attendant_user_id: userId,
    }).returning();
    return ticket;
}

describe('getActiveTicketCounts — exclui tickets presos em conexão desconectada', () => {
    it('conta um ticket "Em Atendimento" numa conexão ativa', async () => {
        await openTicketFor(attendantId, connectedConnId);
        const counts = await getActiveTicketCounts([attendantId]);
        expect(counts.get(attendantId)).toBeGreaterThanOrEqual(1);
    });

    it('não conta um ticket "Em Atendimento" preso numa conexão desconectada', async () => {
        const before = (await getActiveTicketCounts([attendantId])).get(attendantId) ?? 0;
        await openTicketFor(attendantId, disconnectedConnId);
        const after = (await getActiveTicketCounts([attendantId])).get(attendantId) ?? 0;
        expect(after).toBe(before);
    });
});

describe('filterByCapacity — filtra fora quem já bateu o teto', () => {
    it('mantém todo mundo quando o limite está desligado', async () => {
        const result = await filterByCapacity([attendantId], { limit_services_users: false, number_limit_services_users: 1 });
        expect(result).toEqual([attendantId]);
    });

    it('remove quem já atingiu o número configurado', async () => {
        // attendantId já está em 1/1 desde o describe anterior.
        const result = await filterByCapacity([attendantId], { limit_services_users: true, number_limit_services_users: 1 });
        expect(result).not.toContain(attendantId);
    });
});

describe('reopen — respeita o limite de atendimentos simultâneos', () => {
    it('rejeita reabrir quando o atendente já está no teto', async () => {
        // attendantId segue em 1/1 (ticket ativo de outro contato) — teto atingido.
        const contactId = await makeContact(`fechado-${SUFFIX}`);
        const [closedTicket] = await db.insert(tickets).values({
            company_id: companyId, contact_id: contactId, connection_id: connectedConnId,
            status_id: 3, attendant_user_id: attendantId,
        }).returning();

        await expect(
            ticketService.reopen(closedTicket.id, attendantId, companyId, 'admin')
        ).rejects.toThrow(AttendantLimitReachedError);
    });
});

describe('transfer — respeita o limite do atendente de destino', () => {
    it('rejeita transferir para um destino que já está no teto', async () => {
        // attendantId (destino) segue em 1/1; otherAttendantId só empresta o ticket de origem.
        const fromTicket = await openTicketFor(otherAttendantId, connectedConnId);

        await expect(
            ticketService.transfer(fromTicket.id, otherAttendantId, attendantId, companyId, queueId)
        ).rejects.toThrow(AttendantLimitReachedError);
    });

    it('permite transferir para um destino com vaga', async () => {
        // freeAttendantId nunca recebeu ticket algum até aqui — 0/1, tem vaga.
        const fromTicket = await openTicketFor(attendantId, connectedConnId);

        const updated = await ticketService.transfer(fromTicket.id, attendantId, freeAttendantId, companyId, queueId);
        expect(updated.attendant_user_id).toBe(freeAttendantId);
    });
});
