import type { TaskColumn } from './tarefas.db.schema';

/**
 * Tipos de coluna do quadro pessoal: 'stack' = Pilha de Ação (fixa, entrada),
 * 'done' = Concluídas (fixa, saída), 'custom' = criadas pelo usuário.
 */
export type ColumnKind = 'stack' | 'done' | 'custom';

/** Colunas que todo quadro tem, criadas no primeiro acesso. */
export const FIXED_COLUMNS: ReadonlyArray<{ title: string; kind: ColumnKind; position: number }> = [
    { title: 'Pilha de Ação', kind: 'stack', position: 0 },
    { title: 'Concluídas',    kind: 'done',  position: 9999 },
];

const RANK: Record<string, number> = { stack: -1, custom: 0, done: 1 };

/** Regras de layout e posição do quadro, sem banco. */
export class TaskBoard {
    /** Pilha de Ação primeiro, customizadas pela posição, Concluídas por último. */
    static sortColumns(columns: TaskColumn[]): TaskColumn[] {
        return [...columns].sort((a, b) => (RANK[a.kind] ?? 0) - (RANK[b.kind] ?? 0) || a.position - b.position);
    }

    static missingFixedColumns(columns: Pick<TaskColumn, 'kind'>[]) {
        return FIXED_COLUMNS.filter((fixed) => !columns.some((c) => c.kind === fixed.kind));
    }

    static columnOfKind(columns: TaskColumn[], kind: 'stack' | 'done'): TaskColumn {
        const column = columns.find((c) => c.kind === kind);
        if (!column) throw new Error(`Quadro sem coluna fixa "${kind}"`);
        return column;
    }

    /** Nova coluna customizada vai para depois da última customizada. */
    static nextCustomPosition(columns: TaskColumn[]): number {
        return Math.max(0, ...columns.filter((c) => c.kind === 'custom').map((c) => c.position)) + 1;
    }

    /** Tarefa nova entra no topo: uma posição antes da primeira da coluna. */
    static topPosition(firstPositionInColumn: number | null): number {
        return (firstPositionInColumn ?? 1) - 1;
    }

    /** Ordem final da coluna com a tarefa inserida no índice pedido (limitado ao tamanho). */
    static insertAt(columnTaskIds: string[], taskId: string, index: number): string[] {
        const others = columnTaskIds.filter((id) => id !== taskId);
        const at = Math.max(0, Math.min(index, others.length));
        return [...others.slice(0, at), taskId, ...others.slice(at)];
    }

    /** Em Concluídas a tarefa fica concluída (mantendo a data original); fora dela, reaberta. */
    static completedAtFor(destination: TaskColumn, currentCompletedAt: Date | null, now: Date): Date | null {
        return destination.kind === 'done' ? (currentCompletedAt ?? now) : null;
    }
}
