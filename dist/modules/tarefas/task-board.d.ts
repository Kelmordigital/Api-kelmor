import type { TaskColumn } from './tarefas.db.schema';
/**
 * Tipos de coluna do quadro pessoal: 'stack' = Pilha de Ação (fixa, entrada),
 * 'done' = Concluídas (fixa, saída), 'custom' = criadas pelo usuário.
 */
export type ColumnKind = 'stack' | 'done' | 'custom';
/** Colunas que todo quadro tem, criadas no primeiro acesso. */
export declare const FIXED_COLUMNS: ReadonlyArray<{
    title: string;
    kind: ColumnKind;
    position: number;
}>;
/** Regras de layout e posição do quadro, sem banco. */
export declare class TaskBoard {
    /** Pilha de Ação primeiro, customizadas pela posição, Concluídas por último. */
    static sortColumns(columns: TaskColumn[]): TaskColumn[];
    static missingFixedColumns(columns: Pick<TaskColumn, 'kind'>[]): {
        title: string;
        kind: ColumnKind;
        position: number;
    }[];
    static columnOfKind(columns: TaskColumn[], kind: 'stack' | 'done'): TaskColumn;
    /** Nova coluna customizada vai para depois da última customizada. */
    static nextCustomPosition(columns: TaskColumn[]): number;
    /** Tarefa nova entra no topo: uma posição antes da primeira da coluna. */
    static topPosition(firstPositionInColumn: number | null): number;
    /** Ordem final da coluna com a tarefa inserida no índice pedido (limitado ao tamanho). */
    static insertAt(columnTaskIds: string[], taskId: string, index: number): string[];
    /** Em Concluídas a tarefa fica concluída (mantendo a data original); fora dela, reaberta. */
    static completedAtFor(destination: TaskColumn, currentCompletedAt: Date | null, now: Date): Date | null;
}
//# sourceMappingURL=task-board.d.ts.map