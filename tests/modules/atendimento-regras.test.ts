import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, connections, tickets, atendimento_messages, historic_tickets, type Ticket } from '../../src/modules/atendimento/atendimento.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { runSeed } from '../../src/database/seed';
import { buildApp } from '../../src/shared/server';
import { ticketAssignment, ticketClosing, contactResolver, funilStageService } from '../../src/modules/atendimento/atendimento.module';
import { TransicaoNaoPermitidaError, TicketAbertoParaContatoError } from '../../src/modules/atendimento/atendimento.errors';

const SUFFIX = Date.now();
const app = buildApp();
let companyId: string;
let otherCompanyId: string;
let adminId: string;
let token: string;
let connA: number;
let connB: number;
let n = 0;

async function newContact(company = companyId, extra: Partial<typeof contacts.$inferInsert> = {}) {
    const [ct] = await db.insert(contacts).values({ company_id: company, name: `Contato ${SUFFIX}-${n++}`, ...extra }).returning();
    return ct;
}

async function newTicket(values: Partial<typeof tickets.$inferInsert> & { contact_id: number }): Promise<Ticket> {
    const [t] = await db.insert(tickets).values({ company_id: companyId, status_id: 2, ...values }).returning();
    return t;
}

const statusOf = async (id: number) => (await db.select({ s: tickets.status_id }).from(tickets).where(eq(tickets.id, id)))[0].s;
const xpOf = async (id: string) => (await db.select({ xp: users.xp }).from(users).where(eq(users.id, id)))[0].xp ?? 0;
const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/v1/atendimento${url}`, headers: { authorization: `Bearer ${token}` }, payload: payload as any });

beforeAll(async () => {
    await runSeed();
    const [admin] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
    const [co] = await db.insert(companies).values({ name: `Regras ${SUFFIX}`, status: true }).returning({ id: companies.id });
    const [other] = await db.insert(companies).values({ name: `Outra ${SUFFIX}`, status: true }).returning({ id: companies.id });
    companyId = co.id;
    otherCompanyId = other.id;
    const [u] = await db.insert(users).values({
        name: 'Admin Regras', email: `regras-${SUFFIX}@test.com`, password_hash: hashSync('senha123', 10),
        profile_id: admin.id, company_id: companyId, email_verified: true, is_approved: true,
    }).returning({ id: users.id });
    adminId = u.id;
    await db.insert(companyPermissions).values({ company_id: companyId, gamification_enabled: true, sale_xp_amount: 10 })
        .onConflictDoUpdate({ target: companyPermissions.company_id, set: { gamification_enabled: true, sale_xp_amount: 10 } });
    [{ id: connA }] = await db.insert(connections).values({ company_id: companyId, name: 'Conexão A' }).returning({ id: connections.id });
    [{ id: connB }] = await db.insert(connections).values({ company_id: companyId, name: 'Conexão B' }).returning({ id: connections.id });

    await app.ready();
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: `regras-${SUFFIX}@test.com`, password: 'senha123' } });
    token = JSON.parse(login.body).access_token;
});

describe('8.1 transições de status', () => {
    it('devolver ticket Fechado → 409 e nada muda', async () => {
        const t = await newTicket({ contact_id: (await newContact()).id, status_id: 3 });
        await expect(ticketAssignment.returnToQueue(t.id, adminId, companyId, 'admin')).rejects.toThrow(TransicaoNaoPermitidaError);
        expect(await statusOf(t.id)).toBe(3);
        expect(await db.select().from(historic_tickets).where(eq(historic_tickets.ticket_id, t.id))).toHaveLength(0);
    });

    it('transferir ticket Pendente → 409', async () => {
        const t = await newTicket({ contact_id: (await newContact()).id, status_id: 1 });
        await expect(ticketAssignment.transfer(t.id, adminId, 'outro-id', companyId, 1)).rejects.toThrow('Só é possível transferir um atendimento que está aberto.');
    });

    it('fechar ticket já Fechado → 409 e o XP não soma de novo', async () => {
        const t = await newTicket({ contact_id: (await newContact()).id, status_id: 3, is_sale: 1 });
        const before = await xpOf(adminId);
        await expect(ticketClosing.closeTicket(t.id, adminId, companyId, {})).rejects.toThrow('Este atendimento já está fechado.');
        expect(await xpOf(adminId)).toBe(before);
    });

    it('dois fechamentos simultâneos: um passa, o outro dá 409 e o XP soma uma vez', async () => {
        const t = await newTicket({ contact_id: (await newContact()).id, status_id: 2, is_sale: 1 });
        const before = await xpOf(adminId);
        const r = await Promise.allSettled([
            ticketClosing.closeTicket(t.id, adminId, companyId, { sendGoodbye: false }),
            ticketClosing.closeTicket(t.id, adminId, companyId, { sendGoodbye: false }),
        ]);
        expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
        expect((await xpOf(adminId)) - before).toBe(10);
    });

    it('fechar com pesquisa um ticket em Pesquisa → 409', async () => {
        const t = await newTicket({ contact_id: (await newContact()).id, status_id: 7 });
        await expect(ticketClosing.closeTicketWithResearch(t.id, adminId, companyId)).rejects.toThrow(TransicaoNaoPermitidaError);
    });

    it('reabrir ticket em Fluxo → 409', async () => {
        const t = await newTicket({ contact_id: (await newContact()).id, status_id: 9 });
        await expect(ticketAssignment.reopen(t.id, adminId, companyId, 'admin')).rejects.toThrow('Só é possível reabrir um atendimento fechado.');
    });

    it('fechar ticket em Fluxo e em Pesquisa continua permitido', async () => {
        const fluxo = await newTicket({ contact_id: (await newContact()).id, status_id: 9 });
        const pesquisa = await newTicket({ contact_id: (await newContact()).id, status_id: 7 });
        await ticketClosing.closeTicket(fluxo.id, adminId, companyId, { sendGoodbye: false });
        await ticketClosing.closeTicket(pesquisa.id, adminId, companyId, { sendGoodbye: false });
        expect([await statusOf(fluxo.id), await statusOf(pesquisa.id)]).toEqual([3, 3]);
    });
});

describe('8.2 reabrir: conflito só na mesma conexão', () => {
    it('bloqueia com ticket Aberto do mesmo contato na mesma conexão', async () => {
        const ct = await newContact();
        await newTicket({ contact_id: ct.id, connection_id: connA, status_id: 2 });
        const closed = await newTicket({ contact_id: ct.id, connection_id: connA, status_id: 3 });
        await expect(ticketAssignment.reopen(closed.id, adminId, companyId, 'admin')).rejects.toThrow(TicketAbertoParaContatoError);
    });

    it.each([9, 7])('bloqueia quando o aberto da mesma conexão está em status %i', async (status) => {
        const ct = await newContact();
        await newTicket({ contact_id: ct.id, connection_id: connA, status_id: status });
        const closed = await newTicket({ contact_id: ct.id, connection_id: connA, status_id: 3 });
        await expect(ticketAssignment.reopen(closed.id, adminId, companyId, 'admin')).rejects.toThrow('Já existe um atendimento aberto para este contato nesta conexão.');
    });

    it('permite quando o contato só tem ticket aberto em outra conexão', async () => {
        const ct = await newContact();
        await newTicket({ contact_id: ct.id, connection_id: connB, status_id: 2 });
        const closed = await newTicket({ contact_id: ct.id, connection_id: connA, status_id: 3 });
        const reopened = await ticketAssignment.reopen(closed.id, adminId, companyId, 'admin');
        expect(reopened.status_id).toBe(2);
        expect(reopened.attendant_user_id).toBe(adminId);
    });

    it('sem conexão: bloqueia só por outro ticket também sem conexão (Review Focus 4)', async () => {
        const ct = await newContact();
        await newTicket({ contact_id: ct.id, connection_id: connA, status_id: 2 });
        const closed = await newTicket({ contact_id: ct.id, connection_id: null, status_id: 3 });
        expect((await ticketAssignment.reopen(closed.id, adminId, companyId, 'admin')).status_id).toBe(2);

        const ct2 = await newContact();
        await newTicket({ contact_id: ct2.id, connection_id: null, status_id: 1 });
        const closed2 = await newTicket({ contact_id: ct2.id, connection_id: null, status_id: 3 });
        await expect(ticketAssignment.reopen(closed2.id, adminId, companyId, 'admin')).rejects.toThrow(TicketAbertoParaContatoError);
    });
});

describe('8.3 fusão de contatos duplicados (LID) por conexão', () => {
    it('consolida por conexão e com a definição única de aberto', async () => {
        const number = `55119${SUFFIX}`.slice(0, 13);
        const lid = `9${SUFFIX}`;
        const canonical = await newContact(companyId, { number });
        const dup = await newContact(companyId, { lid });
        const at = (h: number) => new Date(Date.now() - h * 3600_000);
        const A = await newTicket({ contact_id: canonical.id, connection_id: connA, status_id: 2, updated_at: at(5) });
        const E = await newTicket({ contact_id: canonical.id, connection_id: null, status_id: 2, updated_at: at(5) });
        const C = await newTicket({ contact_id: dup.id, connection_id: connA, status_id: 1, updated_at: at(1) });
        const B = await newTicket({ contact_id: dup.id, connection_id: connB, status_id: 1, updated_at: at(2) });
        const D = await newTicket({ contact_id: dup.id, connection_id: connB, status_id: 9, updated_at: at(6) });
        await db.insert(atendimento_messages).values([{ ticket_id: A.id, body: 'a1' }, { ticket_id: A.id, body: 'a2' }]);

        await contactResolver.findOrCreate(companyId, number, undefined, lid);

        expect(await statusOf(A.id)).toBe(3);   // conexão A: C (mais recente) fica
        expect(await statusOf(C.id)).toBe(1);
        expect(await statusOf(B.id)).toBe(1);   // conexão B: B fica (antes era fechado)
        expect(await statusOf(D.id)).toBe(3);   // Fluxo conta como aberto
        expect(await statusOf(E.id)).toBe(2);   // grupo sem conexão não mistura
        const moved = await db.select({ t: atendimento_messages.ticket_id }).from(atendimento_messages).where(eq(atendimento_messages.body, 'a1'));
        expect(moved.every((m) => m.t === C.id)).toBe(true);
    });
});

describe('8.4 relatório "Status por contato"', () => {
    it('conta pendentes como status 1 e abertos como status 2', async () => {
        const ct = await newContact();
        for (const s of [1, 2, 2, 3]) await newTicket({ contact_id: ct.id, status_id: s });
        const res = await call('GET', '/tickets/status-by-contact?limit=500');
        const item = JSON.parse(res.body).items.find((i: any) => i.contact_id === ct.id);
        expect(item).toMatchObject({ pending: 1, open: 2, closed: 1, total: 4 });
    });
});

describe('8.5 erros com status real e contrato HTTP', () => {
    it.each([
        ['PUT', '/tickets/999999999/return', undefined],
        ['PUT', '/tickets/999999999/reopen', undefined],
        ['PUT', '/tickets/999999999/pin', undefined],
        ['POST', '/tickets/999999999/close', {}],
        ['POST', '/tickets/999999999/research', undefined],
        ['PUT', '/tickets/999999999/sale', { isSale: false }],
        ['GET', '/tickets/999999999/messages', undefined],
        ['GET', '/tickets/999999999/research-available', undefined],
    ] as const)('%s %s em ticket inexistente → 404', async (method, path, body) => {
        const res = await call(method, path, body);
        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body).error).toBe('Ticket não encontrado');
    });

    it('id inválido → 400', async () => {
        expect((await call('GET', '/tickets/abc/messages')).statusCode).toBe(400);
    });

    it('aceita parâmetros vazios como hoje (Review Focus 2)', async () => {
        expect((await call('GET', '/tickets?connectionId=&queueId=&userId=&search=&dateInit=&dateEnd=&limit=&offset=')).statusCode).toBe(200);
        expect((await call('GET', '/contacts/report?search=&limit=&offset=')).statusCode).toBe(200);
        expect((await call('GET', '/tickets/status-by-contact?dateInit=&dateEnd=')).statusCode).toBe(200);
        expect((await call('GET', '/funil/cards?search=')).statusCode).toBe(200);
    });
});

describe('8.9 envio de mensagem seguro', () => {
    const countMessages = async (id: number) => (await db.select().from(atendimento_messages).where(eq(atendimento_messages.ticket_id, id))).length;

    it.each([true, false])('mensagem (fromMe=%s) em ticket de outra empresa → 404 e nada gravado', async (fromMe) => {
        const ct = await newContact(otherCompanyId);
        const [foreign] = await db.insert(tickets).values({ company_id: otherCompanyId, contact_id: ct.id, status_id: 2 }).returning();
        const res = await call('POST', `/tickets/${foreign.id}/messages`, { body: 'invasão', fromMe });
        expect(res.statusCode).toBe(404);
        expect(await countMessages(foreign.id)).toBe(0);
    });

    it('contactId de outro contato → 400 e nada gravado', async () => {
        const t = await newTicket({ contact_id: (await newContact()).id, status_id: 2, attendant_user_id: adminId });
        const res = await call('POST', `/tickets/${t.id}/messages`, { body: 'x', fromMe: false, contactId: (await newContact()).id });
        expect(res.statusCode).toBe(400);
        expect(await countMessages(t.id)).toBe(0);
    });

    it('contactId igual ao do ticket continua aceito (fromMe=false)', async () => {
        const ct = await newContact();
        const t = await newTicket({ contact_id: ct.id, status_id: 2, attendant_user_id: adminId });
        expect((await call('POST', `/tickets/${t.id}/messages`, { body: 'x', fromMe: false, contactId: ct.id })).statusCode).toBe(200);
    });
});

describe('8.10 etapa do lead manual', () => {
    it('lead com etapa de outra empresa → 400', async () => {
        const foreignStage = (await funilStageService.listStages(otherCompanyId)).find((s) => !s.is_waiting_stage && !s.is_finished_stage)!;
        const res = await call('POST', '/funil/leads', { name: 'Lead X', funil_stage_id: foreignStage.id });
        expect(res.statusCode).toBe(400);
        expect(JSON.parse(res.body).error).toBe('Escolha uma etapa do meio do funil desta empresa.');
    });

    it('lead com a etapa Aguardando → 400', async () => {
        const waiting = (await funilStageService.listStages(companyId)).find((s) => s.is_waiting_stage)!;
        expect((await call('POST', '/funil/leads', { name: 'Lead Y', funil_stage_id: waiting.id })).statusCode).toBe(400);
    });

    it('lead com etapa do meio da empresa → 201', async () => {
        const middle = (await funilStageService.listStages(companyId)).find((s) => !s.is_waiting_stage && !s.is_finished_stage)!;
        const res = await call('POST', '/funil/leads', { name: 'Lead Z', funil_stage_id: middle.id });
        expect(res.statusCode).toBe(201);
        const [row] = await db.select().from(tickets).where(and(eq(tickets.id, JSON.parse(res.body).id), eq(tickets.funil_stage_id, middle.id)));
        expect(row).toBeDefined();
    });
});
