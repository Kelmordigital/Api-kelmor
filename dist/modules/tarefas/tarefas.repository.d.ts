import type { DB } from '../../database/client';
import { TaskColumn, Task } from './tarefas.db.schema';
export interface TaskWithContact extends Task {
    contact: {
        id: number;
        name: string;
        number: string | null;
        profile_pic_url: string | null;
    } | null;
}
export type TaskPatch = Partial<Pick<Task, 'titulo' | 'descricao' | 'due_date' | 'contact_id'>>;
export type NewTaskData = Pick<Task, 'column_id' | 'titulo' | 'descricao' | 'due_date' | 'contact_id' | 'position'>;
/** Dono do quadro: as tarefas e colunas são sempre de um usuário dentro de uma empresa. */
export interface BoardOwner {
    companyId: string;
    userId: string;
}
export interface TaskRepository {
    /** Colunas do quadro, criando as fixas que faltarem (seguro contra acessos simultâneos). */
    ensureColumns(owner: BoardOwner): Promise<TaskColumn[]>;
    listTasks(owner: BoardOwner, archived: boolean): Promise<TaskWithContact[]>;
    listByContact(owner: BoardOwner, contactId: number): Promise<TaskWithContact[]>;
    findTask(owner: BoardOwner, id: string): Promise<Task | null>;
    findColumn(owner: BoardOwner, id: string): Promise<TaskColumn | null>;
    firstPositionIn(columnId: string): Promise<number | null>;
    activeTaskIdsIn(columnId: string): Promise<string[]>;
    insertTask(owner: BoardOwner, data: NewTaskData): Promise<Task>;
    updateTask(owner: BoardOwner, id: string, patch: TaskPatch): Promise<Task | null>;
    /** Muda a coluna/conclusão da tarefa e grava a nova ordem da coluna, numa transação. */
    moveTask(id: string, columnId: string, completedAt: Date | null, orderedIds: string[]): Promise<Task>;
    setArchived(owner: BoardOwner, id: string, archivedAt: Date | null): Promise<Task | null>;
    deleteTask(owner: BoardOwner, id: string): Promise<boolean>;
    insertColumn(owner: BoardOwner, title: string, position: number): Promise<TaskColumn>;
    renameCustomColumn(owner: BoardOwner, id: string, title: string): Promise<TaskColumn | null>;
    /** Apaga a coluna e devolve as tarefas dela para outra coluna, numa transação. */
    deleteColumnMovingTasks(id: string, destinationColumnId: string): Promise<void>;
}
export declare class DrizzleTaskRepository implements TaskRepository {
    private readonly db;
    constructor(db: DB);
    ensureColumns(owner: BoardOwner): Promise<TaskColumn[]>;
    listTasks(owner: BoardOwner, archived: boolean): Promise<TaskWithContact[]>;
    listByContact(owner: BoardOwner, contactId: number): Promise<TaskWithContact[]>;
    findTask(owner: BoardOwner, id: string): Promise<Task | null>;
    findColumn(owner: BoardOwner, id: string): Promise<TaskColumn | null>;
    firstPositionIn(columnId: string): Promise<number | null>;
    activeTaskIdsIn(columnId: string): Promise<string[]>;
    insertTask(owner: BoardOwner, data: NewTaskData): Promise<Task>;
    updateTask(owner: BoardOwner, id: string, patch: TaskPatch): Promise<Task | null>;
    moveTask(id: string, columnId: string, completedAt: Date | null, orderedIds: string[]): Promise<Task>;
    setArchived(owner: BoardOwner, id: string, archivedAt: Date | null): Promise<Task | null>;
    deleteTask(owner: BoardOwner, id: string): Promise<boolean>;
    insertColumn(owner: BoardOwner, title: string, position: number): Promise<TaskColumn>;
    renameCustomColumn(owner: BoardOwner, id: string, title: string): Promise<TaskColumn | null>;
    deleteColumnMovingTasks(id: string, destinationColumnId: string): Promise<void>;
    private columnsOf;
    private ofOwner;
    private selectTasks;
}
//# sourceMappingURL=tarefas.repository.d.ts.map