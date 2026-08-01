import { eq, and, asc, ne, sql } from 'drizzle-orm';
import { db } from '../../database/client';
import { funil_stages, funil_stage_history, tickets, FunilStage } from './atendimento.db.schema';
import { getInterval, type Period } from './dashboard.service';

const DEFAULT_MIDDLE_STAGES: Array<{ name: string; color: string }> = [
    { name: 'Novos Leads', color: 'bg-blue-500' },
    { name: 'Primeiro Contato', color: 'bg-yellow-500' },
    { name: 'Agendado', color: 'bg-purple-500' },
    { name: 'Atendimento', color: 'bg-orange-500' },
    { name: 'Convertido', color: 'bg-green-500' },
];

export class FunilStageProtegidaError extends Error {
    constructor() { super('Esta etapa é fixa e não pode ser alterada ou excluída.'); }
}

export class FunilStageNomeDuplicadoError extends Error {
    constructor() { super('Já existe uma etapa com esse nome.'); }
}

export class FunilStageComTicketsError extends Error {
    constructor() { super('Não é possível excluir uma etapa com atendimentos nela.'); }
}

export class FunilStageNaoEncontradaError extends Error {
    constructor() { super('Etapa não encontrada.'); }
}

/**
 * Provisiona dentro de um advisory lock do Postgres (não em memória — precisa
 * valer entre réplicas do backend, não só dentro de um processo) e reconfere
 * se alguém já provisionou enquanto esperava o lock, antes de inserir. Sem
 * isso, duas requisições concorrentes na primeira carga da tela (GET
 * /funil/cards e GET /funil/stages, que o front dispara em paralelo) viam a
 * tabela vazia ao mesmo tempo e cada uma criava as 7 etapas, duplicando tudo.
 */
async function provisionDefaultStages(companyId: string): Promise<void> {
    await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${companyId}))`);

        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(funil_stages)
            .where(eq(funil_stages.company_id, companyId));
        if (count > 0) return;

        await tx.insert(funil_stages).values({
            company_id: companyId, name: 'Aguardando', color: 'bg-slate-500',
            position: 0, is_waiting_stage: true,
        });
        for (let i = 0; i < DEFAULT_MIDDLE_STAGES.length; i++) {
            await tx.insert(funil_stages).values({
                company_id: companyId, name: DEFAULT_MIDDLE_STAGES[i].name,
                color: DEFAULT_MIDDLE_STAGES[i].color, position: i,
            });
        }
        await tx.insert(funil_stages).values({
            company_id: companyId, name: 'Finalizado', color: 'bg-emerald-600',
            position: 0, is_finished_stage: true,
        });
    });
}

/** Lista as etapas (Aguardando primeiro, meio por position, Finalizado por último). Provisiona se a empresa ainda não tiver nenhuma. */
async function listStages(companyId: string): Promise<FunilStage[]> {
    let stages = await db.select().from(funil_stages)
        .where(eq(funil_stages.company_id, companyId))
        .orderBy(asc(funil_stages.position));

    if (stages.length === 0) {
        await provisionDefaultStages(companyId);
        stages = await db.select().from(funil_stages)
            .where(eq(funil_stages.company_id, companyId))
            .orderBy(asc(funil_stages.position));
    }

    const waiting = stages.filter(s => s.is_waiting_stage);
    const finished = stages.filter(s => s.is_finished_stage);
    const middle = stages.filter(s => !s.is_waiting_stage && !s.is_finished_stage);
    return [...waiting, ...middle, ...finished];
}

function normalizeName(name: string): string {
    return name.trim().toLowerCase();
}

async function assertNameAvailable(companyId: string, name: string, ignoreStageId?: number): Promise<void> {
    const normalized = normalizeName(name);
    if (normalized === 'aguardando' || normalized === 'finalizado') {
        throw new FunilStageNomeDuplicadoError();
    }
    const stages = await db.select().from(funil_stages).where(eq(funil_stages.company_id, companyId));
    const clash = stages.some(s => s.id !== ignoreStageId && normalizeName(s.name) === normalized);
    if (clash) throw new FunilStageNomeDuplicadoError();
}

async function createStage(companyId: string, name: string, color: string): Promise<FunilStage> {
    await listStages(companyId); // garante provisionamento antes de calcular a próxima position
    await assertNameAvailable(companyId, name);

    const middleStages = await db.select().from(funil_stages)
        .where(and(eq(funil_stages.company_id, companyId), eq(funil_stages.is_waiting_stage, false), eq(funil_stages.is_finished_stage, false)));
    const nextPosition = middleStages.length;

    const [created] = await db.insert(funil_stages).values({
        company_id: companyId, name, color, position: nextPosition,
    }).returning();
    return created;
}

async function getOwnStage(stageId: number, companyId: string): Promise<FunilStage> {
    const [stage] = await db.select().from(funil_stages)
        .where(and(eq(funil_stages.id, stageId), eq(funil_stages.company_id, companyId)));
    if (!stage) throw new FunilStageNaoEncontradaError();
    return stage;
}

async function updateStage(stageId: number, companyId: string, updates: { name?: string; color?: string }): Promise<FunilStage> {
    const stage = await getOwnStage(stageId, companyId);
    if (stage.is_waiting_stage || stage.is_finished_stage) throw new FunilStageProtegidaError();
    if (updates.name) await assertNameAvailable(companyId, updates.name, stageId);

    const [updated] = await db.update(funil_stages).set({
        ...(updates.name ? { name: updates.name } : {}),
        ...(updates.color ? { color: updates.color } : {}),
    }).where(eq(funil_stages.id, stageId)).returning();
    return updated;
}

async function deleteStage(stageId: number, companyId: string): Promise<void> {
    const stage = await getOwnStage(stageId, companyId);
    if (stage.is_waiting_stage || stage.is_finished_stage) throw new FunilStageProtegidaError();

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tickets)
        .where(and(eq(tickets.funil_stage_id, stageId), eq(tickets.company_id, companyId), sql`${tickets.deleted_at} is null`));
    if (count > 0) throw new FunilStageComTicketsError();

    await db.delete(funil_stages).where(eq(funil_stages.id, stageId));

    const remaining = await db.select().from(funil_stages)
        .where(and(eq(funil_stages.company_id, companyId), eq(funil_stages.is_waiting_stage, false), eq(funil_stages.is_finished_stage, false)))
        .orderBy(asc(funil_stages.position));
    for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].position !== i) {
            await db.update(funil_stages).set({ position: i }).where(eq(funil_stages.id, remaining[i].id));
        }
    }
}

async function reorderStages(companyId: string, orderedIds: number[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
        await db.update(funil_stages).set({ position: i })
            .where(and(eq(funil_stages.id, orderedIds[i]), eq(funil_stages.company_id, companyId), eq(funil_stages.is_waiting_stage, false), eq(funil_stages.is_finished_stage, false)));
    }
}

/** Regra de derivação: pendente (1/9) → Aguardando; fechado (3) → Finalizado; em atendimento (2) → valor gravado (ou a 1ª etapa do meio, se nunca setado). */
function resolveEffectiveStageId(ticket: { status_id: number; funil_stage_id: number | null }, stages: FunilStage[]): number {
    if (ticket.status_id === 1 || ticket.status_id === 9) {
        return stages.find(s => s.is_waiting_stage)!.id;
    }
    if (ticket.status_id === 3) {
        return stages.find(s => s.is_finished_stage)!.id;
    }
    if (ticket.funil_stage_id != null) return ticket.funil_stage_id;
    const firstMiddle = stages.find(s => !s.is_waiting_stage && !s.is_finished_stage)!;
    return firstMiddle.id;
}

/** Registra a entrada de um ticket numa etapa — alimenta o gráfico de conversão (visão "Funil"). */
async function recordStageEntry(companyId: string, ticketId: number, stageId: number): Promise<void> {
    await db.insert(funil_stage_history).values({ company_id: companyId, ticket_id: ticketId, funil_stage_id: stageId });
}

/**
 * Funil de conversão de verdade: pra cada etapa, quantos tickets (de entre os
 * que ENTRARAM no funil dentro do período) já chegaram a ela em algum momento.
 * A coorte é definida pela primeira entrada de cada ticket (normalmente
 * Aguardando), não por quando ele passou por cada etapa — senão um ticket
 * antigo que só mudou de coluna essa semana pareceria um "lead novo".
 */
async function getConversionFunnel(companyId: string, period: Period): Promise<{ total: number; stages: Array<{ stageId: number; name: string; color: string; count: number }> }> {
    const stages = await listStages(companyId);
    const { start, end } = getInterval(period);

    const rows = await db.select({
        ticket_id: funil_stage_history.ticket_id,
        funil_stage_id: funil_stage_history.funil_stage_id,
        entered_at: funil_stage_history.entered_at,
    }).from(funil_stage_history).where(eq(funil_stage_history.company_id, companyId));

    const firstEntryByTicket = new Map<number, Date>();
    for (const row of rows) {
        const enteredAt = row.entered_at ?? new Date(0);
        const current = firstEntryByTicket.get(row.ticket_id);
        if (!current || enteredAt < current) firstEntryByTicket.set(row.ticket_id, enteredAt);
    }

    const cohortTicketIds = new Set(
        [...firstEntryByTicket.entries()]
            .filter(([, firstEntry]) => firstEntry >= start && firstEntry <= end)
            .map(([ticketId]) => ticketId),
    );

    return {
        // Total de tickets que entraram no funil no período, não o count da
        // etapa Aguardando — um ticket criado antes desta feature existir só
        // ganha histórico na primeira troca de etapa registrada DEPOIS de
        // ativada, então pode "entrar" na análise numa etapa do meio, sem
        // nunca ter passado por Aguardando dentro do período.
        total: cohortTicketIds.size,
        stages: stages.map((stage) => {
            const reached = new Set(
                rows.filter((r) => r.funil_stage_id === stage.id && cohortTicketIds.has(r.ticket_id)).map((r) => r.ticket_id),
            );
            return { stageId: stage.id, name: stage.name, color: stage.color, count: reached.size };
        }),
    };
}

export const funilStageService = {
    listStages,
    createStage,
    updateStage,
    deleteStage,
    reorderStages,
    resolveEffectiveStageId,
    getOwnStage,
    recordStageEntry,
    getConversionFunnel,
};
