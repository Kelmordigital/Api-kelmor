import { describe, it, expect, vi } from 'vitest';
import { TaskBoard } from '../../src/modules/tarefas/task-board';
import { TarefasService, type Viewer } from '../../src/modules/tarefas/tarefas.service';
import type { TaskRepository } from '../../src/modules/tarefas/tarefas.repository';
import type { TaskColumn } from '../../src/modules/tarefas/tarefas.db.schema';
import type { CompanyDirectory } from '../../src/modules/companies/company-directory';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../src/core/errors/http-errors';

const col = (kind: string, position: number, id = `${kind}-${position}`) =>
    ({ id, kind, position, title: id }) as TaskColumn;

describe('TaskBoard', () => {
    it('ordena: Pilha, customizadas por posição, Concluídas', () => {
        const sorted = TaskBoard.sortColumns([col('done', 9999), col('custom', 2), col('stack', 0), col('custom', 1)]);
        expect(sorted.map((c) => c.id)).toEqual(['stack-0', 'custom-1', 'custom-2', 'done-9999']);
    });

    it('aponta as colunas fixas que faltam', () => {
        expect(TaskBoard.missingFixedColumns([]).map((c) => c.kind)).toEqual(['stack', 'done']);
        expect(TaskBoard.missingFixedColumns([col('stack', 0)]).map((c) => c.kind)).toEqual(['done']);
        expect(TaskBoard.missingFixedColumns([col('stack', 0), col('done', 9999)])).toEqual([]);
    });

    it('posições: nova coluna depois da última customizada; nova tarefa no topo', () => {
        expect(TaskBoard.nextCustomPosition([col('stack', 0), col('done', 9999)])).toBe(1);
        expect(TaskBoard.nextCustomPosition([col('custom', 4), col('done', 9999)])).toBe(5);
        expect(TaskBoard.topPosition(null)).toBe(0);
        expect(TaskBoard.topPosition(-3)).toBe(-4);
    });

    it('insere no índice pedido, limitado ao tamanho da coluna', () => {
        expect(TaskBoard.insertAt(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'x', 'b', 'c']);
        expect(TaskBoard.insertAt(['a', 'b'], 'x', 99)).toEqual(['a', 'b', 'x']);
        expect(TaskBoard.insertAt(['a', 'x', 'b'], 'x', 0)).toEqual(['x', 'a', 'b']);
    });

    it('Concluídas conclui mantendo a data original; outras colunas reabrem', () => {
        const now = new Date('2030-01-01');
        const before = new Date('2029-12-01');
        expect(TaskBoard.completedAtFor(col('done', 9999), null, now)).toEqual(now);
        expect(TaskBoard.completedAtFor(col('done', 9999), before, now)).toEqual(before);
        expect(TaskBoard.completedAtFor(col('custom', 1), before, now)).toBeNull();
    });
});

describe('TarefasService — acesso e isolamento', () => {
    function make(directory: Partial<CompanyDirectory> = {}) {
        const repo = {
            ensureColumns: vi.fn(async () => [col('stack', 0, 'stack'), col('done', 9999, 'done')]),
            listTasks: vi.fn(async () => []),
            insertTask: vi.fn(async (_o: unknown, data: object) => ({ id: 't1', ...data })),
            firstPositionIn: vi.fn(async () => null),
            updateTask: vi.fn(async () => null),
        } as unknown as TaskRepository;
        const dir: CompanyDirectory = {
            hasUser: vi.fn(async () => true),
            hasContact: vi.fn(async () => true),
            ...directory,
        };
        const notifier = { boardChanged: vi.fn() };
        return { repo, dir, notifier, service: new TarefasService(repo, dir, notifier) };
    }
    const attendant: Viewer = { companyId: 'c1', userId: 'u1', isAdmin: false };
    const admin: Viewer = { companyId: 'c1', userId: 'a1', isAdmin: true };

    it('quadro de outra pessoa: atendente 403; admin só se a pessoa for da empresa', async () => {
        await expect(make().service.getBoard(attendant, 'u2')).rejects.toBeInstanceOf(ForbiddenError);
        await expect(make().service.getBoard(admin, 'u2')).resolves.toBeDefined();
        const { service, repo } = make({ hasUser: async () => false });
        await expect(service.getBoard(admin, 'fantasma')).rejects.toBeInstanceOf(NotFoundError);
        expect(repo.ensureColumns).not.toHaveBeenCalled();
    });

    it('o próprio quadro não consulta o diretório', async () => {
        const { service, dir } = make();
        await service.getBoard(attendant, 'u1');
        expect(dir.hasUser).not.toHaveBeenCalled();
    });

    it('contato de outra empresa é recusado antes de gravar', async () => {
        const { service, repo, notifier } = make({ hasContact: async () => false });
        await expect(service.create(attendant, { titulo: 'x', contact_id: 9 })).rejects.toEqual(new BadRequestError('Contato não encontrado'));
        await expect(service.update(attendant, 't1', { contact_id: 9 })).rejects.toBeInstanceOf(BadRequestError);
        expect(repo.insertTask).not.toHaveBeenCalled();
        expect(repo.updateTask).not.toHaveBeenCalled();
        expect(notifier.boardChanged).not.toHaveBeenCalled();
    });

    it('coluna desconhecida na criação cai na Pilha de Ação; avisa o quadro', async () => {
        const { service, notifier } = make();
        const task = await service.create(attendant, { titulo: 'x', column_id: 'de-outro' });
        expect(task).toMatchObject({ column_id: 'stack', position: 0 });
        expect(notifier.boardChanged).toHaveBeenCalledWith({ companyId: 'c1', userId: 'u1' });
    });
});
