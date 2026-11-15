import { describe, it, expect, beforeAll } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';
import { db } from '../../src/database/client';
import { companies } from '../../src/modules/companies/company.db.schema';
import { users } from '../../src/modules/auth/auth.schema';
import { profiles } from '../../src/modules/profiles/profile.db.schema';
import { contacts, tickets, funil_stages } from '../../src/modules/atendimento/atendimento.db.schema';
import { buildApp } from '../../src/shared/server';
import { funilBoard, funilStageService } from '../../src/modules/atendimento/atendimento.module';

const SUFFIX = Date.now();
let companyId: string;
let ownerUserId: string;
let otherUserId: string;
let adminUserId: string;
let contactSeq = 0;

async function newContact() {
    const [ct] = await db.insert(contacts)
        .values({ company_id: companyId, name: `Contato Funil ${SUFFIX}-${contactSeq++}` })
        .returning({ id: contacts.id });
    return ct.id;
}

describe('funilStageService — provisionamento e CRUD de etapas', () => {
    beforeAll(async () => {
        const [co] = await db.insert(companies)
            .values({ name: `Empresa FunilKanban ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;
    });

    it('provisiona as 7 etapas na primeira chamada (Aguardando + 5 padrão + Finalizado)', async () => {
        const stages = await funilStageService.listStages(companyId);
        expect(stages).toHaveLength(7);
        expect(stages.filter(s => s.is_waiting_stage)).toHaveLength(1);
        expect(stages.filter(s => s.is_finished_stage)).toHaveLength(1);
        expect(stages[0].is_waiting_stage).toBe(true);
        expect(stages[stages.length - 1].is_finished_stage).toBe(true);
    });

    it('duas chamadas concorrentes na primeira carga (front dispara /funil/cards e /funil/stages juntos) não duplicam as etapas', async () => {
        const [co] = await db.insert(companies)
            .values({ name: `Empresa FunilRace ${SUFFIX}`, status: true })
            .returning({ id: companies.id });

        const [a, b] = await Promise.all([
            funilStageService.listStages(co.id),
            funilStageService.listStages(co.id),
        ]);
        expect(a).toHaveLength(7);
        expect(b).toHaveLength(7);

        const persisted = await db.select().from(funil_stages).where(eq(funil_stages.company_id, co.id));
        expect(persisted).toHaveLength(7);
    });

    it('não provisiona de novo numa segunda chamada (idempotente)', async () => {
        const stages = await funilStageService.listStages(companyId);
        expect(stages).toHaveLength(7);
    });

    it('cria uma etapa nova do meio, no fim da ordem', async () => {
        const created = await funilStageService.createStage(companyId, 'Pós-venda', 'bg-pink-500');
        expect(created.name).toBe('Pós-venda');
        expect(created.is_waiting_stage).toBe(false);
        expect(created.is_finished_stage).toBe(false);
    });

    it('rejeita nome duplicado (case-insensitive) e nome reservado', async () => {
        await expect(funilStageService.createStage(companyId, 'pós-venda', 'bg-red-500')).rejects.toThrow();
        await expect(funilStageService.createStage(companyId, 'aguardando', 'bg-red-500')).rejects.toThrow();
    });

    it('bloqueia renomear/excluir etapa protegida', async () => {
        const stages = await funilStageService.listStages(companyId);
        const waiting = stages.find(s => s.is_waiting_stage)!;
        await expect(funilStageService.updateStage(waiting.id, companyId, { name: 'Outro nome' })).rejects.toThrow();
        await expect(funilStageService.deleteStage(waiting.id, companyId)).rejects.toThrow();
    });

    it('bloqueia excluir etapa do meio com ticket vinculado, permite quando vazia', async () => {
        const stages = await funilStageService.listStages(companyId);
        const stage = stages.find(s => s.name === 'Pós-venda')!;
        const contactId = await newContact();
        const [ticket] = await db.insert(tickets).values({
            company_id: companyId, contact_id: contactId, status_id: 2, funil_stage_id: stage.id,
        }).returning();

        await expect(funilStageService.deleteStage(stage.id, companyId)).rejects.toThrow();

        await db.delete(tickets).where(eq(tickets.id, ticket.id));
        await expect(funilStageService.deleteStage(stage.id, companyId)).resolves.not.toThrow();
    });

    it('resolveEffectiveStageId: pendente vira Aguardando, fechado vira Finalizado, em atendimento usa o valor gravado', async () => {
        const stages = await funilStageService.listStages(companyId);
        const waiting = stages.find(s => s.is_waiting_stage)!;
        const finished = stages.find(s => s.is_finished_stage)!;
        const middle = stages.find(s => !s.is_waiting_stage && !s.is_finished_stage)!;

        expect(funilStageService.resolveEffectiveStageId({ status_id: 1, funil_stage_id: middle.id }, stages)).toBe(waiting.id);
        expect(funilStageService.resolveEffectiveStageId({ status_id: 9, funil_stage_id: null }, stages)).toBe(waiting.id);
        expect(funilStageService.resolveEffectiveStageId({ status_id: 3, funil_stage_id: middle.id }, stages)).toBe(finished.id);
        expect(funilStageService.resolveEffectiveStageId({ status_id: 2, funil_stage_id: middle.id }, stages)).toBe(middle.id);
        expect(funilStageService.resolveEffectiveStageId({ status_id: 2, funil_stage_id: null }, stages)).toBe(stages[1].id);
    });
});

describe('funilBoard.moveTicketFunilStage — árvore de decisão do drag-and-drop', () => {
    let waitingStageId: number;
    let finishedStageId: number;
    let middleAId: number;
    let middleBId: number;

    beforeAll(async () => {
        const [co] = await db.insert(companies)
            .values({ name: `Empresa FunilMove ${SUFFIX}`, status: true })
            .returning({ id: companies.id });
        companyId = co.id;

        const [userProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'user'));
        const [adminProfile] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.tag, 'admin'));

        async function makeUser(label: string, profileId: number) {
            const [u] = await db.insert(users).values({
                name: label, email: `funil-move-${label}-${SUFFIX}@test.com`,
                password_hash: hashSync('senha123', 10),
                profile_id: profileId, company_id: companyId,
                email_verified: true, is_approved: true,
            }).returning({ id: users.id });
            return u.id;
        }
        ownerUserId = await makeUser('owner', userProfile.id);
        otherUserId = await makeUser('other', userProfile.id);
        adminUserId = await makeUser('admin', adminProfile.id);

        const { companyPermissions } = await import('../../src/modules/configuracao-geral/configuracao-geral.db.schema');
        await db.insert(companyPermissions).values({ company_id: companyId, return_ticket: true })
            .onConflictDoUpdate({ target: companyPermissions.company_id, set: { return_ticket: true } });

        const stages = await funilStageService.listStages(companyId);
        waitingStageId = stages.find(s => s.is_waiting_stage)!.id;
        finishedStageId = stages.find(s => s.is_finished_stage)!.id;
        const middles = stages.filter(s => !s.is_waiting_stage && !s.is_finished_stage);
        middleAId = middles[0].id;
        middleBId = middles[1].id;
    });

    async function pendingTicket() {
        const [t] = await db.insert(tickets).values({
            company_id: companyId, contact_id: await newContact(), status_id: 1,
        }).returning();
        return t;
    }
    async function openTicket(attendantId: string, stageId: number) {
        const [t] = await db.insert(tickets).values({
            company_id: companyId, contact_id: await newContact(),
            status_id: 2, attendant_user_id: attendantId, funil_stage_id: stageId,
        }).returning();
        return t;
    }
    async function closedTicket(attendantId: string) {
        const [t] = await db.insert(tickets).values({
            company_id: companyId, contact_id: await newContact(),
            status_id: 3, attendant_user_id: attendantId, closed_by_user_id: attendantId,
        }).returning();
        return t;
    }

    it('mesma origem e destino: no-op', async () => {
        const ticket = await openTicket(ownerUserId, middleAId);
        const result = await funilBoard.moveTicketFunilStage(ticket.id, middleAId, ownerUserId, companyId, 'user');
        expect(result.status_id).toBe(2);
        expect(result.funil_stage_id).toBe(middleAId);
    });

    it('fechado direto pra Aguardando: bloqueado', async () => {
        const ticket = await closedTicket(ownerUserId);
        await expect(
            funilBoard.moveTicketFunilStage(ticket.id, waitingStageId, ownerUserId, companyId, 'user')
        ).rejects.toThrow();
    });

    it('destino Finalizado é sempre rejeitado (fechar exige o fluxo de venda)', async () => {
        const ticket = await openTicket(ownerUserId, middleAId);
        await expect(
            funilBoard.moveTicketFunilStage(ticket.id, finishedStageId, ownerUserId, companyId, 'user')
        ).rejects.toThrow();
    });

    it('Aguardando → coluna do meio: aceita o ticket', async () => {
        const ticket = await pendingTicket();
        const result = await funilBoard.moveTicketFunilStage(ticket.id, middleAId, otherUserId, companyId, 'user');
        expect(result.status_id).toBe(2);
        expect(result.attendant_user_id).toBe(otherUserId);
        expect(result.funil_stage_id).toBe(middleAId);
    });

    it('Finalizado → coluna do meio: reabre o ticket', async () => {
        const ticket = await closedTicket(ownerUserId);
        const result = await funilBoard.moveTicketFunilStage(ticket.id, middleBId, otherUserId, companyId, 'user');
        expect(result.status_id).toBe(2);
        expect(result.attendant_user_id).toBe(otherUserId);
        expect(result.funil_stage_id).toBe(middleBId);
    });

    it('em atendimento → Aguardando: devolve pra fila (precisa de return_ticket)', async () => {
        const { companyPermissions } = await import('../../src/modules/configuracao-geral/configuracao-geral.db.schema');
        await db.insert(companyPermissions).values({ company_id: companyId, return_ticket: false })
            .onConflictDoUpdate({ target: companyPermissions.company_id, set: { return_ticket: false } });

        const ticket = await openTicket(ownerUserId, middleAId);
        await expect(
            funilBoard.moveTicketFunilStage(ticket.id, waitingStageId, ownerUserId, companyId, 'user')
        ).rejects.toThrow();

        await db.update(companyPermissions).set({ return_ticket: true }).where(eq(companyPermissions.company_id, companyId));
        const result = await funilBoard.moveTicketFunilStage(ticket.id, waitingStageId, ownerUserId, companyId, 'user');
        expect(result.status_id).toBe(1);
        expect(result.attendant_user_id).toBeNull();
    });

    it('meio → meio: só o dono ou admin pode mover (visual puro)', async () => {
        const ticket = await openTicket(ownerUserId, middleAId);

        await expect(
            funilBoard.moveTicketFunilStage(ticket.id, middleBId, otherUserId, companyId, 'user')
        ).rejects.toThrow();

        const asAdmin = await funilBoard.moveTicketFunilStage(ticket.id, middleBId, adminUserId, companyId, 'admin');
        expect(asAdmin.funil_stage_id).toBe(middleBId);
        expect(asAdmin.status_id).toBe(2);
        expect(asAdmin.attendant_user_id).toBe(ownerUserId); // continua do mesmo dono, só mudou a coluna
    });
});

describe('GET /atendimento/funil/cards — status derivado, não o valor gravado', () => {
    const app = buildApp();
    let token: string;
    let waitingStageId: number;

    beforeAll(async () => {
        await app.ready();
        const login = await app.inject({
            method: 'POST', url: '/api/v1/auth/login',
            payload: { email: `funil-move-owner-${SUFFIX}@test.com`, password: 'senha123' },
        });
        token = JSON.parse(login.body).access_token;

        const stages = await funilStageService.listStages(companyId);
        waitingStageId = stages.find(s => s.is_waiting_stage)!.id;
    });

    it('ticket pendente aparece com funil_stage_id da etapa Aguardando, mesmo tendo etapa do meio gravada', async () => {
        const contactId = await newContact();
        const [ticket] = await db.insert(tickets).values({
            company_id: companyId, contact_id: contactId, status_id: 1, funil_stage_id: null,
        }).returning();

        const res = await app.inject({
            method: 'GET', url: '/api/v1/atendimento/funil/cards',
            headers: { authorization: `Bearer ${token}` },
        });
        expect(res.statusCode).toBe(200);
        const card = (JSON.parse(res.body) as any[]).find(c => c.id === ticket.id);
        expect(card.funil_stage_id).toBe(waitingStageId);
    });

    it('ticket finalizado há mais de 24h some do quadro; finalizado recentemente continua aparecendo', async () => {
        const oldContactId = await newContact();
        const [oldTicket] = await db.insert(tickets).values({
            company_id: companyId, contact_id: oldContactId, status_id: 3,
        }).returning();
        await db.update(tickets)
            .set({ updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000) })
            .where(eq(tickets.id, oldTicket.id));

        const recentContactId = await newContact();
        const [recentTicket] = await db.insert(tickets).values({
            company_id: companyId, contact_id: recentContactId, status_id: 3,
        }).returning();

        const cards = await funilBoard.getFunilCards(companyId);
        expect(cards.find(c => c.id === oldTicket.id)).toBeUndefined();
        expect(cards.find(c => c.id === recentTicket.id)).toBeDefined();
    });
});
