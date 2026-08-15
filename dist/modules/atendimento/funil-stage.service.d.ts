import { FunilStage } from './atendimento.db.schema';
import { type Period } from './dashboard.service';
export declare class FunilStageProtegidaError extends Error {
    constructor();
}
export declare class FunilStageNomeDuplicadoError extends Error {
    constructor();
}
export declare class FunilStageComTicketsError extends Error {
    constructor();
}
export declare class FunilStageNaoEncontradaError extends Error {
    constructor();
}
/** Lista as etapas (Aguardando primeiro, meio por position, Finalizado por último). Provisiona se a empresa ainda não tiver nenhuma. */
declare function listStages(companyId: string): Promise<FunilStage[]>;
declare function createStage(companyId: string, name: string, color: string): Promise<FunilStage>;
declare function getOwnStage(stageId: number, companyId: string): Promise<FunilStage>;
declare function updateStage(stageId: number, companyId: string, updates: {
    name?: string;
    color?: string;
}): Promise<FunilStage>;
declare function deleteStage(stageId: number, companyId: string): Promise<void>;
declare function reorderStages(companyId: string, orderedIds: number[]): Promise<void>;
/** Regra de derivação: pendente (1/9) → Aguardando; fechado (3) → Finalizado; em atendimento (2) → valor gravado (ou a 1ª etapa do meio, se nunca setado). */
declare function resolveEffectiveStageId(ticket: {
    status_id: number;
    funil_stage_id: number | null;
}, stages: FunilStage[]): number;
/** Registra a entrada de um ticket numa etapa — alimenta o gráfico de conversão (visão "Funil"). */
declare function recordStageEntry(companyId: string, ticketId: number, stageId: number): Promise<void>;
/**
 * Funil de conversão de verdade: pra cada etapa, quantos tickets (de entre os
 * que ENTRARAM no funil dentro do período) já chegaram a ela em algum momento.
 * A coorte é definida pela primeira entrada de cada ticket (normalmente
 * Aguardando), não por quando ele passou por cada etapa — senão um ticket
 * antigo que só mudou de coluna essa semana pareceria um "lead novo".
 */
declare function getConversionFunnel(companyId: string, period: Period): Promise<{
    total: number;
    stages: Array<{
        stageId: number;
        name: string;
        color: string;
        count: number;
    }>;
}>;
export declare const funilStageService: {
    listStages: typeof listStages;
    createStage: typeof createStage;
    updateStage: typeof updateStage;
    deleteStage: typeof deleteStage;
    reorderStages: typeof reorderStages;
    resolveEffectiveStageId: typeof resolveEffectiveStageId;
    getOwnStage: typeof getOwnStage;
    recordStageEntry: typeof recordStageEntry;
    getConversionFunnel: typeof getConversionFunnel;
};
export {};
//# sourceMappingURL=funil-stage.service.d.ts.map