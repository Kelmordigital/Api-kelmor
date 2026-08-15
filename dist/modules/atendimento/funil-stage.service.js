"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.funilStageService = exports.FunilStageNaoEncontradaError = exports.FunilStageComTicketsError = exports.FunilStageNomeDuplicadoError = exports.FunilStageProtegidaError = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("./atendimento.db.schema");
const dashboard_service_1 = require("./dashboard.service");
const DEFAULT_MIDDLE_STAGES = [
    { name: 'Novos Leads', color: 'bg-blue-500' },
    { name: 'Primeiro Contato', color: 'bg-yellow-500' },
    { name: 'Agendado', color: 'bg-purple-500' },
    { name: 'Atendimento', color: 'bg-orange-500' },
    { name: 'Convertido', color: 'bg-green-500' },
];
class FunilStageProtegidaError extends Error {
    constructor() { super('Esta etapa é fixa e não pode ser alterada ou excluída.'); }
}
exports.FunilStageProtegidaError = FunilStageProtegidaError;
class FunilStageNomeDuplicadoError extends Error {
    constructor() { super('Já existe uma etapa com esse nome.'); }
}
exports.FunilStageNomeDuplicadoError = FunilStageNomeDuplicadoError;
class FunilStageComTicketsError extends Error {
    constructor() { super('Não é possível excluir uma etapa com atendimentos nela.'); }
}
exports.FunilStageComTicketsError = FunilStageComTicketsError;
class FunilStageNaoEncontradaError extends Error {
    constructor() { super('Etapa não encontrada.'); }
}
exports.FunilStageNaoEncontradaError = FunilStageNaoEncontradaError;
/**
 * Provisiona dentro de um advisory lock do Postgres (não em memória — precisa
 * valer entre réplicas do backend, não só dentro de um processo) e reconfere
 * se alguém já provisionou enquanto esperava o lock, antes de inserir. Sem
 * isso, duas requisições concorrentes na primeira carga da tela (GET
 * /funil/cards e GET /funil/stages, que o front dispara em paralelo) viam a
 * tabela vazia ao mesmo tempo e cada uma criava as 7 etapas, duplicando tudo.
 */
async function provisionDefaultStages(companyId) {
    await client_1.db.transaction(async (tx) => {
        await tx.execute((0, drizzle_orm_1.sql) `select pg_advisory_xact_lock(hashtext(${companyId}))`);
        const [{ count }] = await tx.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(atendimento_db_schema_1.funil_stages)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.company_id, companyId));
        if (count > 0)
            return;
        await tx.insert(atendimento_db_schema_1.funil_stages).values({
            company_id: companyId, name: 'Aguardando', color: 'bg-slate-500',
            position: 0, is_waiting_stage: true,
        });
        for (let i = 0; i < DEFAULT_MIDDLE_STAGES.length; i++) {
            await tx.insert(atendimento_db_schema_1.funil_stages).values({
                company_id: companyId, name: DEFAULT_MIDDLE_STAGES[i].name,
                color: DEFAULT_MIDDLE_STAGES[i].color, position: i,
            });
        }
        await tx.insert(atendimento_db_schema_1.funil_stages).values({
            company_id: companyId, name: 'Finalizado', color: 'bg-emerald-600',
            position: 0, is_finished_stage: true,
        });
    });
}
/** Lista as etapas (Aguardando primeiro, meio por position, Finalizado por último). Provisiona se a empresa ainda não tiver nenhuma. */
async function listStages(companyId) {
    let stages = await client_1.db.select().from(atendimento_db_schema_1.funil_stages)
        .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.company_id, companyId))
        .orderBy((0, drizzle_orm_1.asc)(atendimento_db_schema_1.funil_stages.position));
    if (stages.length === 0) {
        await provisionDefaultStages(companyId);
        stages = await client_1.db.select().from(atendimento_db_schema_1.funil_stages)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.company_id, companyId))
            .orderBy((0, drizzle_orm_1.asc)(atendimento_db_schema_1.funil_stages.position));
    }
    const waiting = stages.filter(s => s.is_waiting_stage);
    const finished = stages.filter(s => s.is_finished_stage);
    const middle = stages.filter(s => !s.is_waiting_stage && !s.is_finished_stage);
    return [...waiting, ...middle, ...finished];
}
function normalizeName(name) {
    return name.trim().toLowerCase();
}
async function assertNameAvailable(companyId, name, ignoreStageId) {
    const normalized = normalizeName(name);
    if (normalized === 'aguardando' || normalized === 'finalizado') {
        throw new FunilStageNomeDuplicadoError();
    }
    const stages = await client_1.db.select().from(atendimento_db_schema_1.funil_stages).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.company_id, companyId));
    const clash = stages.some(s => s.id !== ignoreStageId && normalizeName(s.name) === normalized);
    if (clash)
        throw new FunilStageNomeDuplicadoError();
}
async function createStage(companyId, name, color) {
    await listStages(companyId); // garante provisionamento antes de calcular a próxima position
    await assertNameAvailable(companyId, name);
    const middleStages = await client_1.db.select().from(atendimento_db_schema_1.funil_stages)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.is_waiting_stage, false), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.is_finished_stage, false)));
    const nextPosition = middleStages.length;
    const [created] = await client_1.db.insert(atendimento_db_schema_1.funil_stages).values({
        company_id: companyId, name, color, position: nextPosition,
    }).returning();
    return created;
}
async function getOwnStage(stageId, companyId) {
    const [stage] = await client_1.db.select().from(atendimento_db_schema_1.funil_stages)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.id, stageId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.company_id, companyId)));
    if (!stage)
        throw new FunilStageNaoEncontradaError();
    return stage;
}
async function updateStage(stageId, companyId, updates) {
    const stage = await getOwnStage(stageId, companyId);
    if (stage.is_waiting_stage || stage.is_finished_stage)
        throw new FunilStageProtegidaError();
    if (updates.name)
        await assertNameAvailable(companyId, updates.name, stageId);
    const [updated] = await client_1.db.update(atendimento_db_schema_1.funil_stages).set({
        ...(updates.name ? { name: updates.name } : {}),
        ...(updates.color ? { color: updates.color } : {}),
    }).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.id, stageId)).returning();
    return updated;
}
async function deleteStage(stageId, companyId) {
    const stage = await getOwnStage(stageId, companyId);
    if (stage.is_waiting_stage || stage.is_finished_stage)
        throw new FunilStageProtegidaError();
    const [{ count }] = await client_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(atendimento_db_schema_1.tickets)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.funil_stage_id, stageId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.sql) `${atendimento_db_schema_1.tickets.deleted_at} is null`));
    if (count > 0)
        throw new FunilStageComTicketsError();
    await client_1.db.delete(atendimento_db_schema_1.funil_stages).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.id, stageId));
    const remaining = await client_1.db.select().from(atendimento_db_schema_1.funil_stages)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.is_waiting_stage, false), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.is_finished_stage, false)))
        .orderBy((0, drizzle_orm_1.asc)(atendimento_db_schema_1.funil_stages.position));
    for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].position !== i) {
            await client_1.db.update(atendimento_db_schema_1.funil_stages).set({ position: i }).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.id, remaining[i].id));
        }
    }
}
async function reorderStages(companyId, orderedIds) {
    for (let i = 0; i < orderedIds.length; i++) {
        await client_1.db.update(atendimento_db_schema_1.funil_stages).set({ position: i })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.id, orderedIds[i]), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.is_waiting_stage, false), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stages.is_finished_stage, false)));
    }
}
/** Regra de derivação: pendente (1/9) → Aguardando; fechado (3) → Finalizado; em atendimento (2) → valor gravado (ou a 1ª etapa do meio, se nunca setado). */
function resolveEffectiveStageId(ticket, stages) {
    if (ticket.status_id === 1 || ticket.status_id === 9) {
        return stages.find(s => s.is_waiting_stage).id;
    }
    if (ticket.status_id === 3) {
        return stages.find(s => s.is_finished_stage).id;
    }
    if (ticket.funil_stage_id != null)
        return ticket.funil_stage_id;
    const firstMiddle = stages.find(s => !s.is_waiting_stage && !s.is_finished_stage);
    return firstMiddle.id;
}
/** Registra a entrada de um ticket numa etapa — alimenta o gráfico de conversão (visão "Funil"). */
async function recordStageEntry(companyId, ticketId, stageId) {
    await client_1.db.insert(atendimento_db_schema_1.funil_stage_history).values({ company_id: companyId, ticket_id: ticketId, funil_stage_id: stageId });
}
/**
 * Funil de conversão de verdade: pra cada etapa, quantos tickets (de entre os
 * que ENTRARAM no funil dentro do período) já chegaram a ela em algum momento.
 * A coorte é definida pela primeira entrada de cada ticket (normalmente
 * Aguardando), não por quando ele passou por cada etapa — senão um ticket
 * antigo que só mudou de coluna essa semana pareceria um "lead novo".
 */
async function getConversionFunnel(companyId, period) {
    const stages = await listStages(companyId);
    const { start, end } = (0, dashboard_service_1.getInterval)(period);
    const rows = await client_1.db.select({
        ticket_id: atendimento_db_schema_1.funil_stage_history.ticket_id,
        funil_stage_id: atendimento_db_schema_1.funil_stage_history.funil_stage_id,
        entered_at: atendimento_db_schema_1.funil_stage_history.entered_at,
    }).from(atendimento_db_schema_1.funil_stage_history).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.funil_stage_history.company_id, companyId));
    const firstEntryByTicket = new Map();
    for (const row of rows) {
        const enteredAt = row.entered_at ?? new Date(0);
        const current = firstEntryByTicket.get(row.ticket_id);
        if (!current || enteredAt < current)
            firstEntryByTicket.set(row.ticket_id, enteredAt);
    }
    const cohortTicketIds = new Set([...firstEntryByTicket.entries()]
        .filter(([, firstEntry]) => firstEntry >= start && firstEntry <= end)
        .map(([ticketId]) => ticketId));
    return {
        // Total de tickets que entraram no funil no período, não o count da
        // etapa Aguardando — um ticket criado antes desta feature existir só
        // ganha histórico na primeira troca de etapa registrada DEPOIS de
        // ativada, então pode "entrar" na análise numa etapa do meio, sem
        // nunca ter passado por Aguardando dentro do período.
        total: cohortTicketIds.size,
        stages: stages.map((stage) => {
            const reached = new Set(rows.filter((r) => r.funil_stage_id === stage.id && cohortTicketIds.has(r.ticket_id)).map((r) => r.ticket_id));
            return { stageId: stage.id, name: stage.name, color: stage.color, count: reached.size };
        }),
    };
}
exports.funilStageService = {
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
//# sourceMappingURL=funil-stage.service.js.map