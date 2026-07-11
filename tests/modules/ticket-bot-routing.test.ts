import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { contacts } from '../../src/modules/atendimento/atendimento.db.schema';
import { bots } from '../../src/modules/bots/bots.db.schema';
import { ticketService } from '../../src/modules/atendimento/ticket.service';

const SUFFIX = Date.now();
let companyWithBotId: string;
let companyWithoutBotId: string;
let contactWithBotId: number;
let contactWithoutBotId: number;

beforeAll(async () => {
    const [coBot] = await db.insert(companies)
        .values({ name: `Empresa Com Bot ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyWithBotId = coBot.id;

    const [coSemBot] = await db.insert(companies)
        .values({ name: `Empresa Sem Bot ${SUFFIX}`, status: true })
        .returning({ id: companies.id });
    companyWithoutBotId = coSemBot.id;

    await db.insert(bots).values({
        company_id: companyWithBotId,
        name: 'Bot Padrão',
        active: true,
        default_bot: true,
    });

    const [ctBot] = await db.insert(contacts)
        .values({ company_id: companyWithBotId, name: 'Contato Com Bot' })
        .returning({ id: contacts.id });
    contactWithBotId = ctBot.id;

    const [ctSemBot] = await db.insert(contacts)
        .values({ company_id: companyWithoutBotId, name: 'Contato Sem Bot' })
        .returning({ id: contacts.id });
    contactWithoutBotId = ctSemBot.id;
});

describe('findOrCreateOpen — status inicial conforme bot ativo', () => {
    it('cria ticket em status_id=9 (Bot) quando a empresa tem bot ativo/padrão', async () => {
        const { ticket, created } = await ticketService.findOrCreateOpen(companyWithBotId, contactWithBotId);
        expect(created).toBe(true);
        expect(ticket.status_id).toBe(9);
    });

    it('cria ticket em status_id=1 (Pendente) quando a empresa não tem bot ativo', async () => {
        const { ticket, created } = await ticketService.findOrCreateOpen(companyWithoutBotId, contactWithoutBotId);
        expect(created).toBe(true);
        expect(ticket.status_id).toBe(1);
    });

    it('reaproveita o ticket em Bot já existente em vez de criar outro', async () => {
        const first = await ticketService.findOrCreateOpen(companyWithBotId, contactWithBotId);
        const second = await ticketService.findOrCreateOpen(companyWithBotId, contactWithBotId);
        expect(second.created).toBe(false);
        expect(second.ticket.id).toBe(first.ticket.id);
    });
});
