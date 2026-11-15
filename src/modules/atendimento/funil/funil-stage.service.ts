import { eq, and, asc, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import { getInterval, type Period } from '../../../core/time/period';
import { funil_stages, funil_stage_history, tickets, type FunilStage } from '../atendimento.db.schema';
import {
    FunilStageComTicketsError, FunilStageNaoEncontradaError, FunilStageNomeDuplicadoError, FunilStageProtegidaError,
} from '../atendimento.errors';

const DEFAULT_MIDDLE_STAGES: Array<{ name: string; color: string }> = [
    { name: 'Novos Leads', color: 'bg-blue-500' },
    { name: 'Primeiro Contato', color: 'bg-yellow-500' },
    { name: 'Agendado', color: 'bg-purple-500' },
    { name: 'Atendimento', color: 'bg-orange-500' },
    { name: 'Convertido', color: 'bg-green-500' },
];

const normalizeName = (name: string) => name.trim().toLowerCase();

/** Regra de derivação: pendente (1/9) → Aguardando; fechado (3) → Finalizado; em atendimento (2) → valor gravado (ou a 1ª etapa do meio). */
export function resolveEffectiveStageId(ticket: { status_id: number; funil_stage_id: number | null }, stages: FunilStage[]): number {
    if (ticket.status_id === 1 || ticket.status_id === 9) return stages.find((s) => s.is_waiting_stage)!.id;
    if (ticket.status_id === 3) return stages.find((s) => s.is_finished_stage)!.id;
    if (ticket.funil_stage_id != null) return ticket.funil_stage_id;
    return stages.find((s) => !s.is_waiting_stage && !s.is_finished_stage)!.id;
}

/** Etapas do quadro Kanban (Aguardando e Finalizado fixas; as do meio, da empresa) e o funil de conversão. */
export class FunilStageService {
    constructor(private readonly db: DbExecutor) {}

    /**
     * Provisiona dentro de um advisory lock do Postgres (vale entre réplicas) e reconfere
     * se alguém já provisionou enquanto esperava — sem isso, GET /funil/cards e
     * GET /funil/stages em paralelo duplicavam as 7 etapas.
     */
    private async provisionDefaultStages(companyId: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${companyId}))`);
            const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(funil_stages)
                .where(eq(funil_stages.company_id, companyId));
            if (count > 0) return;

            await tx.insert(funil_stages).values({ company_id: companyId, name: 'Aguardando', color: 'bg-slate-500', position: 0, is_waiting_stage: true });
            for (let i = 0; i < DEFAULT_MIDDLE_STAGES.length; i++) {
                await tx.insert(funil_stages).values({ company_id: companyId, name: DEFAULT_MIDDLE_STAGES[i].name, color: DEFAULT_MIDDLE_STAGES[i].color, position: i });
            }
            await tx.insert(funil_stages).values({ company_id: companyId, name: 'Finalizado', color: 'bg-emerald-600', position: 0, is_finished_stage: true });
        });
    }

    private byPosition(companyId: string) {
        return this.db.select().from(funil_stages).where(eq(funil_stages.company_id, companyId)).orderBy(asc(funil_stages.position));
    }

    /** Aguardando primeiro, meio por position, Finalizado por último. Provisiona se a empresa ainda não tiver nenhuma. */
    async listStages(companyId: string): Promise<FunilStage[]> {
        let stages = await this.byPosition(companyId);
        if (stages.length === 0) {
            await this.provisionDefaultStages(companyId);
            stages = await this.byPosition(companyId);
        }
        return [
            ...stages.filter((s) => s.is_waiting_stage),
            ...stages.filter((s) => !s.is_waiting_stage && !s.is_finished_stage),
            ...stages.filter((s) => s.is_finished_stage),
        ];
    }

    private async assertNameAvailable(companyId: string, name: string, ignoreStageId?: number): Promise<void> {
        const normalized = normalizeName(name);
        if (normalized === 'aguardando' || normalized === 'finalizado') throw new FunilStageNomeDuplicadoError();
        const stages = await this.db.select().from(funil_stages).where(eq(funil_stages.company_id, companyId));
        if (stages.some((s) => s.id !== ignoreStageId && normalizeName(s.name) === normalized)) throw new FunilStageNomeDuplicadoError();
    }

    private middleStages(companyId: string) {
        return this.db.select().from(funil_stages)
            .where(and(eq(funil_stages.company_id, companyId), eq(funil_stages.is_waiting_stage, false), eq(funil_stages.is_finished_stage, false)))
            .orderBy(asc(funil_stages.position));
    }

    async createStage(companyId: string, name: string, color: string): Promise<FunilStage> {
        await this.listStages(companyId); // garante provisionamento antes de calcular a próxima position
        await this.assertNameAvailable(companyId, name);
        const nextPosition = (await this.middleStages(companyId)).length;
        const [created] = await this.db.insert(funil_stages).values({ company_id: companyId, name, color, position: nextPosition }).returning();
        return created;
    }

    async getOwnStage(stageId: number, companyId: string): Promise<FunilStage> {
        const [stage] = await this.db.select().from(funil_stages)
            .where(and(eq(funil_stages.id, stageId), eq(funil_stages.company_id, companyId)));
        if (!stage) throw new FunilStageNaoEncontradaError();
        return stage;
    }

    async updateStage(stageId: number, companyId: string, updates: { name?: string; color?: string }): Promise<FunilStage> {
        const stage = await this.getOwnStage(stageId, companyId);
        if (stage.is_waiting_stage || stage.is_finished_stage) throw new FunilStageProtegidaError();
        if (updates.name) await this.assertNameAvailable(companyId, updates.name, stageId);
        const [updated] = await this.db.update(funil_stages).set({
            ...(updates.name ? { name: updates.name } : {}),
            ...(updates.color ? { color: updates.color } : {}),
        }).where(eq(funil_stages.id, stageId)).returning();
        return updated;
    }

    async deleteStage(stageId: number, companyId: string): Promise<void> {
        const stage = await this.getOwnStage(stageId, companyId);
        if (stage.is_waiting_stage || stage.is_finished_stage) throw new FunilStageProtegidaError();

        const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(tickets)
            .where(and(eq(tickets.funil_stage_id, stageId), eq(tickets.company_id, companyId), sql`${tickets.deleted_at} is null`));
        if (count > 0) throw new FunilStageComTicketsError();

        await this.db.delete(funil_stages).where(eq(funil_stages.id, stageId));
        const remaining = await this.middleStages(companyId);
        for (let i = 0; i < remaining.length; i++) {
            if (remaining[i].position !== i) await this.db.update(funil_stages).set({ position: i }).where(eq(funil_stages.id, remaining[i].id));
        }
    }

    async reorderStages(companyId: string, orderedIds: number[]): Promise<void> {
        for (let i = 0; i < orderedIds.length; i++) {
            await this.db.update(funil_stages).set({ position: i }).where(and(
                eq(funil_stages.id, orderedIds[i]), eq(funil_stages.company_id, companyId),
                eq(funil_stages.is_waiting_stage, false), eq(funil_stages.is_finished_stage, false),
            ));
        }
    }

    resolveEffectiveStageId(ticket: { status_id: number; funil_stage_id: number | null }, stages: FunilStage[]): number {
        return resolveEffectiveStageId(ticket, stages);
    }

    /** Registra a entrada de um ticket numa etapa — alimenta o gráfico de conversão. */
    async recordStageEntry(companyId: string, ticketId: number, stageId: number): Promise<void> {
        await this.db.insert(funil_stage_history).values({ company_id: companyId, ticket_id: ticketId, funil_stage_id: stageId });
    }

    /**
     * Funil de conversão: pra cada etapa, quantos tickets (dos que ENTRARAM no funil no
     * período, pela primeira entrada) já chegaram a ela em algum momento.
     */
    async getConversionFunnel(companyId: string, period: Period): Promise<{ total: number; stages: Array<{ stageId: number; name: string; color: string; count: number }> }> {
        const stages = await this.listStages(companyId);
        const { start, end } = getInterval(period);

        const rows = await this.db.select({
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
        const cohort = new Set([...firstEntryByTicket.entries()].filter(([, first]) => first >= start && first <= end).map(([id]) => id));

        return {
            total: cohort.size,
            stages: stages.map((stage) => ({
                stageId: stage.id, name: stage.name, color: stage.color,
                count: new Set(rows.filter((r) => r.funil_stage_id === stage.id && cohort.has(r.ticket_id)).map((r) => r.ticket_id)).size,
            })),
        };
    }
}
