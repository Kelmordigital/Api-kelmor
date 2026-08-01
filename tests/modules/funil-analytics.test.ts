import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets, funil_stage_history } from '../../src/modules/atendimento/atendimento.db.schema';
import { companyPermissions } from '../../src/modules/configuracao-geral/configuracao-geral.db.schema';
import { funilStageService } from '../../src/modules/atendimento/funil-stage.service';
import { ticketService } from '../../src/modules/atendimento/ticket.service';

const SUFFIX = Date.now();

async function makeCompany(kanbanEnabled: boolean) {
    const [co] = await db.insert(companies)
        .values({ name: `Empresa FunilAnalytics ${SUFFIX}-${Math.random()}`, status: true })
        .returning({ id: companies.id });
    await db.insert(companyPermissions).values({ company_id: co.id, active_kanban: kanbanEnabled });
    return co.id;
}

async function newContact(companyId: string) {
    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: `Contato ${SUFFIX}-${Math.random()}` })
        .returning({ id: contacts.id });
    return ct.id;
}

async function newUser(companyId: string) {
    const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));
    const [u] = await db.insert(users).values({
        name: 'Analytics Tester', email: `funil-analytics-${SUFFIX}-${Math.random()}@test.com`,
        password_hash: hashSync('senha123', 10),
        profile_id: userProfile.id, company_id: companyId,
        email_verified: true, is_approved: true,
    }).returning({ id: users.id });
    return u.id;
}

describe('registro de histórico de etapas (funil_stage_history)', () => {
    it('findOrCreateOpen grava entrada em Aguardando quando active_kanban está ligado', async () => {
        const companyId = await makeCompany(true);
        const contactId = await newContact(companyId);

        const { ticket } = await ticketService.findOrCreateOpen(companyId, contactId);

        const stages = await funilStageService.listStages(companyId);
        const waitingId = stages.find(s => s.is_waiting_stage)!.id;
        const rows = await db.select().from(funil_stage_history).where(eq(funil_stage_history.ticket_id, ticket.id));
        expect(rows).toHaveLength(1);
        expect(rows[0].funil_stage_id).toBe(waitingId);
    });

    it('findOrCreateOpen NÃO grava histórico quando active_kanban está desligado', async () => {
        const companyId = await makeCompany(false);
        const contactId = await newContact(companyId);

        const { ticket } = await ticketService.findOrCreateOpen(companyId, contactId);

        const rows = await db.select().from(funil_stage_history).where(eq(funil_stage_history.ticket_id, ticket.id));
        expect(rows).toHaveLength(0);
    });

    it('createFunilLead grava entrada em Aguardando', async () => {
        const companyId = await makeCompany(true);
        const card = await ticketService.createFunilLead(companyId, { name: 'Lead Teste' });

        const stages = await funilStageService.listStages(companyId);
        const waitingId = stages.find(s => s.is_waiting_stage)!.id;
        const rows = await db.select().from(funil_stage_history).where(eq(funil_stage_history.ticket_id, card.id));
        expect(rows).toHaveLength(1);
        expect(rows[0].funil_stage_id).toBe(waitingId);
    });

    it('moveTicketFunilStage grava a nova etapa quando efetiva a troca, mas não em no-op', async () => {
        const companyId = await makeCompany(true);
        const stages = await funilStageService.listStages(companyId);
        const middle = stages.filter(s => !s.is_waiting_stage && !s.is_finished_stage);

        const contactId = await newContact(companyId);
        const [ticket] = await db.insert(tickets).values({ company_id: companyId, contact_id: contactId, status_id: 1 }).returning();
        const userId = await newUser(companyId);

        await ticketService.moveTicketFunilStage(ticket.id, middle[0].id, userId, companyId, 'admin');
        let rows = await db.select().from(funil_stage_history).where(eq(funil_stage_history.ticket_id, ticket.id));
        expect(rows.filter(r => r.funil_stage_id === middle[0].id)).toHaveLength(1);

        // no-op (mesma origem/destino) não grava linha nova
        await ticketService.moveTicketFunilStage(ticket.id, middle[0].id, userId, companyId, 'admin');
        rows = await db.select().from(funil_stage_history).where(eq(funil_stage_history.ticket_id, ticket.id));
        expect(rows).toHaveLength(1);

        // troca de verdade grava outra linha
        await ticketService.moveTicketFunilStage(ticket.id, middle[1].id, userId, companyId, 'admin');
        rows = await db.select().from(funil_stage_history).where(eq(funil_stage_history.ticket_id, ticket.id));
        expect(rows).toHaveLength(2);
        expect(rows.some(r => r.funil_stage_id === middle[1].id)).toBe(true);
    });
});

describe('funilStageService.getConversionFunnel', () => {
    it('conta tickets distintos por etapa, respeitando o período pela data de entrada no funil', async () => {
        const companyId = await makeCompany(true);
        const stages = await funilStageService.listStages(companyId);
        const waiting = stages.find(s => s.is_waiting_stage)!;
        const middle = stages.filter(s => !s.is_waiting_stage && !s.is_finished_stage);

        // Ticket A: entrou há 2 dias (dentro da semana), avançou até middle[1]
        const contactA = await newContact(companyId);
        const [ticketA] = await db.insert(tickets).values({ company_id: companyId, contact_id: contactA, status_id: 2, funil_stage_id: middle[1].id }).returning();
        await db.insert(funil_stage_history).values([
            { company_id: companyId, ticket_id: ticketA.id, funil_stage_id: waiting.id, entered_at: new Date(Date.now() - 2 * 86400000) },
            { company_id: companyId, ticket_id: ticketA.id, funil_stage_id: middle[0].id, entered_at: new Date(Date.now() - 2 * 86400000) },
            { company_id: companyId, ticket_id: ticketA.id, funil_stage_id: middle[1].id, entered_at: new Date(Date.now() - 1 * 86400000) },
        ]);

        // Ticket B: entrou há 2 dias também, só ficou em Aguardando
        const contactB = await newContact(companyId);
        const [ticketB] = await db.insert(tickets).values({ company_id: companyId, contact_id: contactB, status_id: 1 }).returning();
        await db.insert(funil_stage_history).values([
            { company_id: companyId, ticket_id: ticketB.id, funil_stage_id: waiting.id, entered_at: new Date(Date.now() - 2 * 86400000) },
        ]);

        // Ticket C: entrou há 90 dias (fora do período "week") — não deve contar
        const contactC = await newContact(companyId);
        const [ticketC] = await db.insert(tickets).values({ company_id: companyId, contact_id: contactC, status_id: 1 }).returning();
        await db.insert(funil_stage_history).values([
            { company_id: companyId, ticket_id: ticketC.id, funil_stage_id: waiting.id, entered_at: new Date(Date.now() - 90 * 86400000) },
        ]);

        const funnel = await funilStageService.getConversionFunnel(companyId, 'week');
        const byId = new Map(funnel.stages.map(f => [f.stageId, f.count]));

        expect(funnel.total).toBe(2); // A e B entraram na semana; C não
        expect(byId.get(waiting.id)).toBe(2); // A e B, não C
        expect(byId.get(middle[0].id)).toBe(1); // só A
        expect(byId.get(middle[1].id)).toBe(1); // só A
        expect(funnel.stages.map(f => f.stageId)).toEqual(stages.map(s => s.id)); // ordem: Aguardando, meio por position, Finalizado
    });

    it('total reflete a coorte mesmo quando o ticket só ganhou histórico numa etapa do meio (pré-existente à feature)', async () => {
        const companyId = await makeCompany(true);
        const stages = await funilStageService.listStages(companyId);
        const middle = stages.filter(s => !s.is_waiting_stage && !s.is_finished_stage);

        // Ticket criado antes da feature existir: nunca teve entrada em
        // Aguardando registrada, só ganha 1ª linha de histórico agora, ao
        // ser movido pra uma etapa do meio.
        const contactId = await newContact(companyId);
        const [ticket] = await db.insert(tickets).values({ company_id: companyId, contact_id: contactId, status_id: 2, funil_stage_id: middle[1].id }).returning();
        await db.insert(funil_stage_history).values([
            { company_id: companyId, ticket_id: ticket.id, funil_stage_id: middle[1].id, entered_at: new Date() },
        ]);

        const funnel = await funilStageService.getConversionFunnel(companyId, 'day');
        const byId = new Map(funnel.stages.map(f => [f.stageId, f.count]));

        expect(funnel.total).toBe(1);
        expect(byId.get(stages.find(s => s.is_waiting_stage)!.id)).toBe(0);
        expect(byId.get(middle[1].id)).toBe(1);
    });
});
