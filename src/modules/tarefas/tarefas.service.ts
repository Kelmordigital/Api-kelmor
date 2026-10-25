import { BadRequestError, ForbiddenError, NotFoundError } from '../../core/errors/http-errors';
import type { CompanyDirectory } from '../companies/company-directory';
import type { Task, TaskColumn } from './tarefas.db.schema';
import type { BoardOwner, TaskPatch, TaskRepository, TaskWithContact } from './tarefas.repository';
import type { CreateTaskInput, UpdateTaskInput } from './tarefas.dto';
import { TaskBoard } from './task-board';

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

const TASK_NOT_FOUND = 'Tarefa não encontrada';

/**
 * Central de Tarefas: quadro pessoal. Cada usuário gerencia o próprio quadro;
 * admins podem VISUALIZAR o de outro usuário da empresa (somente leitura).
 */
export class TarefasService {
    constructor(
        private readonly repository: TaskRepository,
        private readonly directory: CompanyDirectory,
        private readonly notifier: BoardNotifier,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async getBoard(viewer: Viewer, ownerId?: string): Promise<{ columns: TaskColumn[]; tasks: TaskWithContact[] }> {
        const owner = await this.boardToView(viewer, ownerId);
        const columns = await this.repository.ensureColumns(owner);
        return { columns, tasks: await this.repository.listTasks(owner, false) };
    }

    async getArchived(viewer: Viewer, ownerId?: string): Promise<TaskWithContact[]> {
        return this.repository.listTasks(await this.boardToView(viewer, ownerId), true);
    }

    /** Tarefas não arquivadas de um contato no quadro do próprio usuário (widget da conversa). */
    listByContact(viewer: Viewer, contactId: number): Promise<TaskWithContact[]> {
        return this.repository.listByContact(TarefasService.own(viewer), contactId);
    }

    async create(viewer: Viewer, input: CreateTaskInput): Promise<Task> {
        const owner = TarefasService.own(viewer);
        await this.assertContactOfCompany(owner.companyId, input.contact_id);

        const columns = await this.repository.ensureColumns(owner);
        const column = columns.find((c) => c.id === input.column_id) ?? TaskBoard.columnOfKind(columns, 'stack');

        const task = await this.repository.insertTask(owner, {
            column_id:  column.id,
            titulo:     input.titulo,
            descricao:  input.descricao ?? null,
            contact_id: input.contact_id ?? null,
            due_date:   input.due_date ?? null,
            position:   TaskBoard.topPosition(await this.repository.firstPositionIn(column.id)),
        });
        this.notifier.boardChanged(owner);
        return task;
    }

    async update(viewer: Viewer, id: string, input: UpdateTaskInput): Promise<Task> {
        const owner = TarefasService.own(viewer);
        await this.assertContactOfCompany(owner.companyId, input.contact_id);

        const patch: TaskPatch = {};
        for (const [key, value] of Object.entries(input)) {
            if (value !== undefined) Object.assign(patch, { [key]: value });
        }
        const task = TarefasService.orNotFound(await this.repository.updateTask(owner, id, patch), TASK_NOT_FOUND);
        this.notifier.boardChanged(owner);
        return task;
    }

    /** Move para uma coluna/posição do próprio quadro; Concluídas conclui, as outras reabrem. */
    async move(viewer: Viewer, id: string, columnId: string, index: number): Promise<Task> {
        const owner = TarefasService.own(viewer);
        const task = await this.repository.findTask(owner, id);
        const column = await this.repository.findColumn(owner, columnId);
        if (!task || !column) throw new NotFoundError('Tarefa ou coluna não encontrada');

        const ordered = TaskBoard.insertAt(await this.repository.activeTaskIdsIn(column.id), id, index);
        const moved = await this.repository.moveTask(id, column.id, TaskBoard.completedAtFor(column, task.completed_at, this.now()), ordered);
        this.notifier.boardChanged(owner);
        return moved;
    }

    /** Concluir (vai para o topo de Concluídas) ou reabrir (topo da Pilha de Ação). */
    async setDone(viewer: Viewer, id: string, done: boolean): Promise<Task> {
        const columns = await this.repository.ensureColumns(TarefasService.own(viewer));
        return this.move(viewer, id, TaskBoard.columnOfKind(columns, done ? 'done' : 'stack').id, 0);
    }

    async setArchived(viewer: Viewer, id: string, archived: boolean): Promise<Task> {
        const owner = TarefasService.own(viewer);
        const task = TarefasService.orNotFound(
            await this.repository.setArchived(owner, id, archived ? this.now() : null), TASK_NOT_FOUND,
        );
        this.notifier.boardChanged(owner);
        return task;
    }

    async remove(viewer: Viewer, id: string): Promise<void> {
        const owner = TarefasService.own(viewer);
        if (!(await this.repository.deleteTask(owner, id))) throw new NotFoundError(TASK_NOT_FOUND);
        this.notifier.boardChanged(owner);
    }

    async createColumn(viewer: Viewer, title: string): Promise<TaskColumn> {
        const owner = TarefasService.own(viewer);
        const columns = await this.repository.ensureColumns(owner);
        const column = await this.repository.insertColumn(owner, title, TaskBoard.nextCustomPosition(columns));
        this.notifier.boardChanged(owner);
        return column;
    }

    /** Só colunas customizadas são renomeadas; as fixas respondem "não encontrada". */
    async renameColumn(viewer: Viewer, id: string, title: string): Promise<TaskColumn> {
        const owner = TarefasService.own(viewer);
        const column = TarefasService.orNotFound(await this.repository.renameCustomColumn(owner, id, title), 'Coluna não encontrada');
        this.notifier.boardChanged(owner);
        return column;
    }

    /** Exclui coluna customizada; as tarefas dela voltam para a Pilha de Ação. */
    async deleteColumn(viewer: Viewer, id: string): Promise<void> {
        const owner = TarefasService.own(viewer);
        const columns = await this.repository.ensureColumns(owner);
        const column = columns.find((c) => c.id === id);
        if (!column || column.kind !== 'custom') throw new NotFoundError('Coluna não encontrada ou não pode ser excluída');

        await this.repository.deleteColumnMovingTasks(id, TaskBoard.columnOfKind(columns, 'stack').id);
        this.notifier.boardChanged(owner);
    }

    /** Quadro a exibir: o próprio, ou o de outro usuário da empresa se o viewer for admin. */
    private async boardToView(viewer: Viewer, ownerId?: string): Promise<BoardOwner> {
        if (!ownerId || ownerId === viewer.userId) return TarefasService.own(viewer);
        if (!viewer.isAdmin) throw new ForbiddenError('Apenas administradores podem ver o quadro de outros usuários.');
        if (!(await this.directory.hasUser(viewer.companyId, ownerId))) throw new NotFoundError('Usuário não encontrado');
        return { companyId: viewer.companyId, userId: ownerId };
    }

    private async assertContactOfCompany(companyId: string, contactId: number | null | undefined): Promise<void> {
        if (contactId != null && !(await this.directory.hasContact(companyId, contactId))) {
            throw new BadRequestError('Contato não encontrado');
        }
    }

    private static own(viewer: Viewer): BoardOwner {
        return { companyId: viewer.companyId, userId: viewer.userId };
    }

    private static orNotFound<T>(row: T | null, message: string): T {
        if (!row) throw new NotFoundError(message);
        return row;
    }
}
