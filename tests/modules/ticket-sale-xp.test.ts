import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets } from '../../src/modules/atendimento/atendimento.db.schema';
import { ticketService } from '../../src/modules/atendimento/ticket.service';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { runSeed } from '../../src/database/seed';

const SUFFIX = Date.now();
let companyId: string;
let contactId: number;

async function makeUser(label: string) {
    const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
    const [u] = await db.insert(users).values({
        name: label, email: `sale-xp-${label}-${SUFFIX}@test.com`,
        password_hash: hashSync('senha123', 10),
        profile_id: profile.id, company_id: companyId,
        email_verified: true, is_approved: true,
    }).returning({ id: users.id });
    return u.id;
}

async function makeOpenTicket() {
    const [t] = await db.insert(tickets).values({
        company_id: companyId, contact_id: contactId, status_id: 2,
    }).returning();
    return t.id;
}

async function xpOf(userId: string): Promise<number> {
    const [row] = await db.select({ xp: users.xp }).from(users).where(eq(users.id, userId));
    return row.xp;
}

beforeAll(async () => {
    await runSeed();
    const [co] = await db.insert(companies)
        .values({ name: `Empresa Sale XP ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyId = co.id;

    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: 'Contato Sale XP', number: '5511999992222' })
        .returning({ id: contacts.id });
    contactId = ct.id;
});

describe('XP real ao fechar atendimento como venda (users.xp)', () => {
    it('fechar SEM classificar como venda não soma XP', async () => {
        const userId = await makeUser('sem-classificacao');
        const ticketId = await makeOpenTicket();

        await ticketService.closeTicket(ticketId, userId, companyId, {});

        expect(await xpOf(userId)).toBe(0);
    });

    it('fechar classificado como NÃO-venda não soma XP', async () => {
        const userId = await makeUser('nao-venda');
        const ticketId = await makeOpenTicket();

        await ticketService.registerSale(ticketId, companyId, { isSale: false });
        await ticketService.closeTicket(ticketId, userId, companyId, {});

        expect(await xpOf(userId)).toBe(0);
    });

    it('fechar classificado como venda soma 10 XP', async () => {
        const userId = await makeUser('uma-venda');
        const ticketId = await makeOpenTicket();

        await ticketService.registerSale(ticketId, companyId, { isSale: true, saleAmount: '149,90' });
        await ticketService.closeTicket(ticketId, userId, companyId, {});

        expect(await xpOf(userId)).toBe(10);
    });

    it('soma cumulativamente em vendas fechadas separadas pelo mesmo usuário', async () => {
        const userId = await makeUser('duas-vendas');

        const ticket1 = await makeOpenTicket();
        await ticketService.registerSale(ticket1, companyId, { isSale: true, saleAmount: '100,00' });
        await ticketService.closeTicket(ticket1, userId, companyId, {});

        const ticket2 = await makeOpenTicket();
        await ticketService.registerSale(ticket2, companyId, { isSale: true, saleAmount: '200,00' });
        await ticketService.closeTicket(ticket2, userId, companyId, {});

        expect(await xpOf(userId)).toBe(20);
    });

    it('XP vai pra quem FECHA o ticket, não necessariamente quem registrou a venda', async () => {
        const registrante = await makeUser('registrante');
        const fechador = await makeUser('fechador');
        const ticketId = await makeOpenTicket();

        // registerSale não recebe userId (é só classificação do ticket) — quem fecha é que ganha o XP.
        await ticketService.registerSale(ticketId, companyId, { isSale: true, saleAmount: '50,00' });
        await ticketService.closeTicket(ticketId, fechador, companyId, {});

        expect(await xpOf(fechador)).toBe(10);
        expect(await xpOf(registrante)).toBe(0);
    });
});

describe('XP para de contar quando gamification_enabled está desligado', () => {
    let gateCompanyId: string;
    let gateContactId: number;

    beforeAll(async () => {
        const [co] = await db.insert(companies)
            .values({ name: `Empresa Sale XP Gate ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        gateCompanyId = co.id;

        const [ct] = await db.insert(contacts)
            .values({ company_id: gateCompanyId, name: 'Contato Gate', number: '5511999993333' })
            .returning({ id: contacts.id });
        gateContactId = ct.id;

        await db.insert(companyPermissions)
            .values({ company_id: gateCompanyId, gamification_enabled: false })
            .onConflictDoUpdate({ target: companyPermissions.company_id, set: { gamification_enabled: false } });
    });

    it('fechar uma venda com a empresa desligada não soma XP nenhum', async () => {
        const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [u] = await db.insert(users).values({
            name: 'Vendedor Desligado', email: `sale-xp-gate-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: gateCompanyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });

        const [ticket] = await db.insert(tickets).values({
            company_id: gateCompanyId, contact_id: gateContactId, status_id: 2,
        }).returning();

        await ticketService.registerSale(ticket.id, gateCompanyId, { isSale: true, saleAmount: '500,00' });
        await ticketService.closeTicket(ticket.id, u.id, gateCompanyId, {});

        expect(await xpOf(u.id)).toBe(0);
    });
});

describe('sale_xp_amount configurável (o dono decide quanto XP por venda fechada)', () => {
    let customCompanyId: string;
    let customContactId: number;

    beforeAll(async () => {
        const [co] = await db.insert(companies)
            .values({ name: `Empresa XP Custom ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        customCompanyId = co.id;

        const [ct] = await db.insert(contacts)
            .values({ company_id: customCompanyId, name: 'Contato XP Custom', number: '5511999994444' })
            .returning({ id: contacts.id });
        customContactId = ct.id;

        // Dono configurou 25 XP por venda em vez do padrão (10).
        await db.insert(companyPermissions)
            .values({ company_id: customCompanyId, sale_xp_amount: 25 })
            .onConflictDoUpdate({ target: companyPermissions.company_id, set: { sale_xp_amount: 25 } });
    });

    it('fechar uma venda concede o valor configurado (25), não o padrão fixo (10)', async () => {
        const [profile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [u] = await db.insert(users).values({
            name: 'Vendedor XP Custom', email: `sale-xp-custom-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: customCompanyId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });

        const [ticket] = await db.insert(tickets).values({
            company_id: customCompanyId, contact_id: customContactId, status_id: 2,
        }).returning();

        await ticketService.registerSale(ticket.id, customCompanyId, { isSale: true, saleAmount: '300,00' });
        await ticketService.closeTicket(ticket.id, u.id, customCompanyId, {});

        expect(await xpOf(u.id)).toBe(25);
    });
});
