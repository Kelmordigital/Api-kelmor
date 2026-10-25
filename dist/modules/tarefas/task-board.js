"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskBoard = exports.FIXED_COLUMNS = void 0;
/** Colunas que todo quadro tem, criadas no primeiro acesso. */
exports.FIXED_COLUMNS = [
    { title: 'Pilha de Ação', kind: 'stack', position: 0 },
    { title: 'Concluídas', kind: 'done', position: 9999 },
];
const RANK = { stack: -1, custom: 0, done: 1 };
/** Regras de layout e posição do quadro, sem banco. */
class TaskBoard {
    /** Pilha de Ação primeiro, customizadas pela posição, Concluídas por último. */
    static sortColumns(columns) {
        return [...columns].sort((a, b) => (RANK[a.kind] ?? 0) - (RANK[b.kind] ?? 0) || a.position - b.position);
    }
    static missingFixedColumns(columns) {
        return exports.FIXED_COLUMNS.filter((fixed) => !columns.some((c) => c.kind === fixed.kind));
    }
    static columnOfKind(columns, kind) {
        const column = columns.find((c) => c.kind === kind);
        if (!column)
            throw new Error(`Quadro sem coluna fixa "${kind}"`);
        return column;
    }
    /** Nova coluna customizada vai para depois da última customizada. */
    static nextCustomPosition(columns) {
        return Math.max(0, ...columns.filter((c) => c.kind === 'custom').map((c) => c.position)) + 1;
    }
    /** Tarefa nova entra no topo: uma posição antes da primeira da coluna. */
    static topPosition(firstPositionInColumn) {
        return (firstPositionInColumn ?? 1) - 1;
    }
    /** Ordem final da coluna com a tarefa inserida no índice pedido (limitado ao tamanho). */
    static insertAt(columnTaskIds, taskId, index) {
        const others = columnTaskIds.filter((id) => id !== taskId);
        const at = Math.max(0, Math.min(index, others.length));
        return [...others.slice(0, at), taskId, ...others.slice(at)];
    }
    /** Em Concluídas a tarefa fica concluída (mantendo a data original); fora dela, reaberta. */
    static completedAtFor(destination, currentCompletedAt, now) {
        return destination.kind === 'done' ? (currentCompletedAt ?? now) : null;
    }
}
exports.TaskBoard = TaskBoard;
//# sourceMappingURL=task-board.js.map