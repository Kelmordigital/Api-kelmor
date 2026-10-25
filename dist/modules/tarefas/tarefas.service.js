"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TarefasService = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const task_board_1 = require("./task-board");
const TASK_NOT_FOUND = 'Tarefa não encontrada';
/**
 * Central de Tarefas: quadro pessoal. Cada usuário gerencia o próprio quadro;
 * admins podem VISUALIZAR o de outro usuário da empresa (somente leitura).
 */
class TarefasService {
    repository;
    directory;
    notifier;
    now;
    constructor(repository, directory, notifier, now = () => new Date()) {
        this.repository = repository;
        this.directory = directory;
        this.notifier = notifier;
        this.now = now;
    }
    async getBoard(viewer, ownerId) {
        const owner = await this.boardToView(viewer, ownerId);
        const columns = await this.repository.ensureColumns(owner);
        return { columns, tasks: await this.repository.listTasks(owner, false) };
    }
    async getArchived(viewer, ownerId) {
        return this.repository.listTasks(await this.boardToView(viewer, ownerId), true);
    }
    /** Tarefas não arquivadas de um contato no quadro do próprio usuário (widget da conversa). */
    listByContact(viewer, contactId) {
        return this.repository.listByContact(TarefasService.own(viewer), contactId);
    }
    async create(viewer, input) {
        const owner = TarefasService.own(viewer);
        await this.assertContactOfCompany(owner.companyId, input.contact_id);
        const columns = await this.repository.ensureColumns(owner);
        const column = columns.find((c) => c.id === input.column_id) ?? task_board_1.TaskBoard.columnOfKind(columns, 'stack');
        const task = await this.repository.insertTask(owner, {
            column_id: column.id,
            titulo: input.titulo,
            descricao: input.descricao ?? null,
            contact_id: input.contact_id ?? null,
            due_date: input.due_date ?? null,
            position: task_board_1.TaskBoard.topPosition(await this.repository.firstPositionIn(column.id)),
        });
        this.notifier.boardChanged(owner);
        return task;
    }
    async update(viewer, id, input) {
        const owner = TarefasService.own(viewer);
        await this.assertContactOfCompany(owner.companyId, input.contact_id);
        const patch = {};
        for (const [key, value] of Object.entries(input)) {
            if (value !== undefined)
                Object.assign(patch, { [key]: value });
        }
        const task = TarefasService.orNotFound(await this.repository.updateTask(owner, id, patch), TASK_NOT_FOUND);
        this.notifier.boardChanged(owner);
        return task;
    }
    /** Move para uma coluna/posição do próprio quadro; Concluídas conclui, as outras reabrem. */
    async move(viewer, id, columnId, index) {
        const owner = TarefasService.own(viewer);
        const task = await this.repository.findTask(owner, id);
        const column = await this.repository.findColumn(owner, columnId);
        if (!task || !column)
            throw new http_errors_1.NotFoundError('Tarefa ou coluna não encontrada');
        const ordered = task_board_1.TaskBoard.insertAt(await this.repository.activeTaskIdsIn(column.id), id, index);
        const moved = await this.repository.moveTask(id, column.id, task_board_1.TaskBoard.completedAtFor(column, task.completed_at, this.now()), ordered);
        this.notifier.boardChanged(owner);
        return moved;
    }
    /** Concluir (vai para o topo de Concluídas) ou reabrir (topo da Pilha de Ação). */
    async setDone(viewer, id, done) {
        const columns = await this.repository.ensureColumns(TarefasService.own(viewer));
        return this.move(viewer, id, task_board_1.TaskBoard.columnOfKind(columns, done ? 'done' : 'stack').id, 0);
    }
    async setArchived(viewer, id, archived) {
        const owner = TarefasService.own(viewer);
        const task = TarefasService.orNotFound(await this.repository.setArchived(owner, id, archived ? this.now() : null), TASK_NOT_FOUND);
        this.notifier.boardChanged(owner);
        return task;
    }
    async remove(viewer, id) {
        const owner = TarefasService.own(viewer);
        if (!(await this.repository.deleteTask(owner, id)))
            throw new http_errors_1.NotFoundError(TASK_NOT_FOUND);
        this.notifier.boardChanged(owner);
    }
    async createColumn(viewer, title) {
        const owner = TarefasService.own(viewer);
        const columns = await this.repository.ensureColumns(owner);
        const column = await this.repository.insertColumn(owner, title, task_board_1.TaskBoard.nextCustomPosition(columns));
        this.notifier.boardChanged(owner);
        return column;
    }
    /** Só colunas customizadas são renomeadas; as fixas respondem "não encontrada". */
    async renameColumn(viewer, id, title) {
        const owner = TarefasService.own(viewer);
        const column = TarefasService.orNotFound(await this.repository.renameCustomColumn(owner, id, title), 'Coluna não encontrada');
        this.notifier.boardChanged(owner);
        return column;
    }
    /** Exclui coluna customizada; as tarefas dela voltam para a Pilha de Ação. */
    async deleteColumn(viewer, id) {
        const owner = TarefasService.own(viewer);
        const columns = await this.repository.ensureColumns(owner);
        const column = columns.find((c) => c.id === id);
        if (!column || column.kind !== 'custom')
            throw new http_errors_1.NotFoundError('Coluna não encontrada ou não pode ser excluída');
        await this.repository.deleteColumnMovingTasks(id, task_board_1.TaskBoard.columnOfKind(columns, 'stack').id);
        this.notifier.boardChanged(owner);
    }
    /** Quadro a exibir: o próprio, ou o de outro usuário da empresa se o viewer for admin. */
    async boardToView(viewer, ownerId) {
        if (!ownerId || ownerId === viewer.userId)
            return TarefasService.own(viewer);
        if (!viewer.isAdmin)
            throw new http_errors_1.ForbiddenError('Apenas administradores podem ver o quadro de outros usuários.');
        if (!(await this.directory.hasUser(viewer.companyId, ownerId)))
            throw new http_errors_1.NotFoundError('Usuário não encontrado');
        return { companyId: viewer.companyId, userId: ownerId };
    }
    async assertContactOfCompany(companyId, contactId) {
        if (contactId != null && !(await this.directory.hasContact(companyId, contactId))) {
            throw new http_errors_1.BadRequestError('Contato não encontrado');
        }
    }
    static own(viewer) {
        return { companyId: viewer.companyId, userId: viewer.userId };
    }
    static orNotFound(row, message) {
        if (!row)
            throw new http_errors_1.NotFoundError(message);
        return row;
    }
}
exports.TarefasService = TarefasService;
//# sourceMappingURL=tarefas.service.js.map