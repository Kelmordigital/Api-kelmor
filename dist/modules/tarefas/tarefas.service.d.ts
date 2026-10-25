import type { CompanyDirectory } from '../companies/company-directory';
import type { Task, TaskColumn } from './tarefas.db.schema';
import type { BoardOwner, TaskRepository, TaskWithContact } from './tarefas.repository';
import type { CreateTaskInput, UpdateTaskInput } from './tarefas.dto';
/** Quem está pedindo — o quadro mexido é sempre o dele; ver o de outro, só admin. */
export interface Viewer {
    companyId: string;
    userId: string;
    isAdmin: boolean;
}
/** Avisa quem está com o quadro aberto que ele mudou. */
export interface BoardNotifier {
    boardChanged(owner: BoardOwner): void;
}
/**
 * Central de Tarefas: quadro pessoal. Cada usuário gerencia o próprio quadro;
 * admins podem VISUALIZAR o de outro usuário da empresa (somente leitura).
 */
export declare class TarefasService {
    private readonly repository;
    private readonly directory;
    private readonly notifier;
    private readonly now;
    constructor(repository: TaskRepository, directory: CompanyDirectory, notifier: BoardNotifier, now?: () => Date);
    getBoard(viewer: Viewer, ownerId?: string): Promise<{
        columns: TaskColumn[];
        tasks: TaskWithContact[];
    }>;
    getArchived(viewer: Viewer, ownerId?: string): Promise<TaskWithContact[]>;
    /** Tarefas não arquivadas de um contato no quadro do próprio usuário (widget da conversa). */
    listByContact(viewer: Viewer, contactId: number): Promise<TaskWithContact[]>;
    create(viewer: Viewer, input: CreateTaskInput): Promise<Task>;
    update(viewer: Viewer, id: string, input: UpdateTaskInput): Promise<Task>;
    /** Move para uma coluna/posição do próprio quadro; Concluídas conclui, as outras reabrem. */
    move(viewer: Viewer, id: string, columnId: string, index: number): Promise<Task>;
    /** Concluir (vai para o topo de Concluídas) ou reabrir (topo da Pilha de Ação). */
    setDone(viewer: Viewer, id: string, done: boolean): Promise<Task>;
    setArchived(viewer: Viewer, id: string, archived: boolean): Promise<Task>;
    remove(viewer: Viewer, id: string): Promise<void>;
    createColumn(viewer: Viewer, title: string): Promise<TaskColumn>;
    /** Só colunas customizadas são renomeadas; as fixas respondem "não encontrada". */
    renameColumn(viewer: Viewer, id: string, title: string): Promise<TaskColumn>;
    /** Exclui coluna customizada; as tarefas dela voltam para a Pilha de Ação. */
    deleteColumn(viewer: Viewer, id: string): Promise<void>;
    /** Quadro a exibir: o próprio, ou o de outro usuário da empresa se o viewer for admin. */
    private boardToView;
    private assertContactOfCompany;
    private static own;
    private static orNotFound;
}
//# sourceMappingURL=tarefas.service.d.ts.map