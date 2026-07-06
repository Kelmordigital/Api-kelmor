import { TaskColumn, Task } from './tarefas.db.schema';
export interface TaskWithContact extends Task {
    contact: {
        id: number;
        name: string;
        number: string | null;
        profile_pic_url: string | null;
    } | null;
}
export declare const tarefasService: {
    /** Garante que o quadro do usuário tem as colunas fixas (Pilha de Ação / Concluídas). */
    ensureBoard(companyId: string, userId: string): Promise<TaskColumn[]>;
    getBoard(companyId: string, ownerId: string): Promise<{
        columns: TaskColumn[];
        tasks: TaskWithContact[];
    }>;
    getArchived(companyId: string, ownerId: string): Promise<TaskWithContact[]>;
    /** Tarefas não-arquivadas de um contato no quadro do próprio usuário (widget da conversa). */
    listByContact(companyId: string, userId: string, contactId: number): Promise<TaskWithContact[]>;
    create(companyId: string, userId: string, payload: {
        titulo: string;
        descricao?: string | null;
        contact_id?: number | null;
        due_date?: Date | null;
        column_id?: string | null;
    }): Promise<Task>;
    update(id: string, companyId: string, userId: string, payload: Partial<Pick<Task, "titulo" | "descricao" | "due_date" | "contact_id">>): Promise<Task | null>;
    /** Move a tarefa para uma coluna/posição. Reindexa a coluna de destino. */
    move(id: string, companyId: string, userId: string, columnId: string, index: number): Promise<Task | null>;
    /** Concluir (move p/ Concluídas) ou reabrir (volta p/ Pilha de Ação). */
    setDone(id: string, companyId: string, userId: string, done: boolean): Promise<Task | null>;
    setArchived(id: string, companyId: string, userId: string, archived: boolean): Promise<Task | null>;
    remove(id: string, companyId: string, userId: string): Promise<boolean>;
    createColumn(companyId: string, userId: string, title: string): Promise<TaskColumn>;
    renameColumn(id: string, companyId: string, userId: string, title: string): Promise<TaskColumn | null>;
    /** Exclui coluna customizada; as tarefas dela voltam para a Pilha de Ação. */
    deleteColumn(id: string, companyId: string, userId: string): Promise<boolean>;
};
//# sourceMappingURL=tarefas.service.d.ts.map