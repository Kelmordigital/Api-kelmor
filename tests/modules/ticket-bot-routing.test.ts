import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { contacts } from '../../src/modules/atendimento/atendimento.db.schema';
import { bots } from '../../src/modules/bots/bots.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { runSeed } from '../../src/database/seed';
import { conversations, ticketAssignment } from '../../src/modules/atendimento/atendimento.module';
import { shouldRunBot } from '../../src/modules/atendimento/ticket-status';

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
        const { ticket, created } = await conversations.findOrCreateOpen(companyWithBotId, contactWithBotId);
        expect(created).toBe(true);
        expect(ticket.status_id).toBe(9);
    });

    it('cria ticket em status_id=1 (Pendente) quando a empresa não tem bot ativo', async () => {
        const { ticket, created } = await conversations.findOrCreateOpen(companyWithoutBotId, contactWithoutBotId);
        expect(created).toBe(true);
        expect(ticket.status_id).toBe(1);
    });

    it('reaproveita o ticket em Bot já existente em vez de criar outro', async () => {
        const first = await conversations.findOrCreateOpen(companyWithBotId, contactWithBotId);
        const second = await conversations.findOrCreateOpen(companyWithBotId, contactWithBotId);
        expect(second.created).toBe(false);
        expect(second.ticket.id).toBe(first.ticket.id);
    });
});

describe('assignAttendant — aceita ticket em Bot e é atômico', () => {
    let attendantId: string;

    beforeAll(async () => {
        await runSeed();
        const [profile] = await db.select({ id: profiles.id })
            .from(profiles).where(eq(profiles.tag, 'user'));
        const [u] = await db.insert(users).values({
            name: 'Atendente Fluxo', email: `fluxo-${SUFFIX}@test.com`,
            password_hash: hashSync('senha123', 10),
            profile_id: profile.id, company_id: companyWithBotId,
            email_verified: true, is_approved: true,
        }).returning({ id: users.id });
        attendantId = u.id;
    });

    it('aceita um ticket em status_id=9 (Bot), virando status_id=2', async () => {
        const { ticket } = await conversations.findOrCreateOpen(companyWithBotId, contactWithBotId);
        expect(ticket.status_id).toBe(9);

        const updated = await ticketAssignment.assignAttendant(ticket.id, attendantId, companyWithBotId);
        expect(updated.status_id).toBe(2);
        expect(updated.attendant_user_id).toBe(attendantId);
    });

    it('rejeita aceitar um ticket que já tem atendente (corrida bot-vs-atendente / atendente-vs-atendente)', async () => {
        const { ticket } = await conversations.findOrCreateOpen(companyWithoutBotId, contactWithoutBotId);
        await ticketAssignment.assignAttendant(ticket.id, attendantId, companyWithoutBotId);

        await expect(
            ticketAssignment.assignAttendant(ticket.id, attendantId, companyWithoutBotId)
        ).rejects.toThrow();
    });
});


describe('shouldRunBot — decide se o executor do bot deve rodar', () => {
    it('true quando o ticket está em status_id=9 (Bot)', () => {
        expect(shouldRunBot({ status_id: 9 })).toBe(true);
    });

    it('false para Pendente, Aberto, Fechado e Pesquisa', () => {
        expect(shouldRunBot({ status_id: 1 })).toBe(false);
        expect(shouldRunBot({ status_id: 2 })).toBe(false);
        expect(shouldRunBot({ status_id: 3 })).toBe(false);
        expect(shouldRunBot({ status_id: 7 })).toBe(false);
    });
});
