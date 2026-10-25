import { eq, and, asc, desc, isNull, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { taskColumns, tasks, TaskColumn, Task } from './tarefas.db.schema';
import { contacts } from '../atendimento/atendimento.db.schema';
import { TaskBoard } from './task-board';

export interface TaskWithContact extends Task {
    contact: { id: number; name: string; number: string | null; profile_pic_url: string | null } | null;
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

export class DrizzleTaskRepository implements TaskRepository {
    constructor(private readonly db: DB) {}

    async ensureColumns(owner: BoardOwner): Promise<TaskColumn[]> {
        const existing = await this.columnsOf(this.db, owner);
        if (TaskBoard.missingFixedColumns(existing).length === 0) return TaskBoard.sortColumns(existing);

        return this.db.transaction(async (tx) => {
            // Serializa a criação por quadro: dois primeiros acessos simultâneos não duplicam colunas
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`task-board:${owner.companyId}:${owner.userId}`}))`);
            const columns = await this.columnsOf(tx, owner);
            const missing = TaskBoard.missingFixedColumns(columns);
            if (missing.length > 0) {
                const created = await tx.insert(taskColumns)
                    .values(missing.map((m) => ({ ...m, company_id: owner.companyId, user_id: owner.userId })))
                    .returning();
                columns.push(...created);
            }
            return TaskBoard.sortColumns(columns);
        });
    }

    listTasks(owner: BoardOwner, archived: boolean): Promise<TaskWithContact[]> {
        return archived
            ? this.selectTasks(and(this.ofOwner(owner), isNotNull(tasks.archived_at)), [desc(tasks.archived_at)])
            : this.selectTasks(and(this.ofOwner(owner), isNull(tasks.archived_at)), [asc(tasks.position), desc(tasks.created_at)]);
    }

    listByContact(owner: BoardOwner, contactId: number): Promise<TaskWithContact[]> {
        return this.selectTasks(
            and(this.ofOwner(owner), eq(tasks.contact_id, contactId), isNull(tasks.archived_at)),
            [asc(tasks.completed_at), desc(tasks.created_at)],
        );
    }

    async findTask(owner: BoardOwner, id: string): Promise<Task | null> {
        const [row] = await this.db.select().from(tasks).where(and(eq(tasks.id, id), this.ofOwner(owner)));
        return row ?? null;
    }

    async findColumn(owner: BoardOwner, id: string): Promise<TaskColumn | null> {
        const [row] = await this.db.select().from(taskColumns)
            .where(and(eq(taskColumns.id, id), eq(taskColumns.company_id, owner.companyId), eq(taskColumns.user_id, owner.userId)));
        return row ?? null;
    }

    async firstPositionIn(columnId: string): Promise<number | null> {
        const [row] = await this.db.select({ position: tasks.position }).from(tasks)
            .where(and(eq(tasks.column_id, columnId), isNull(tasks.archived_at)))
            .orderBy(asc(tasks.position))
            .limit(1);
        return row?.position ?? null;
    }

    async activeTaskIdsIn(columnId: string): Promise<string[]> {
        const rows = await this.db.select({ id: tasks.id }).from(tasks)
            .where(and(eq(tasks.column_id, columnId), isNull(tasks.archived_at)))
            .orderBy(asc(tasks.position), desc(tasks.created_at));
        return rows.map((r) => r.id);
    }

    async insertTask(owner: BoardOwner, data: NewTaskData): Promise<Task> {
        const [row] = await this.db.insert(tasks)
            .values({ ...data, company_id: owner.companyId, user_id: owner.userId })
            .returning();
        return row;
    }

    async updateTask(owner: BoardOwner, id: string, patch: TaskPatch): Promise<Task | null> {
        const [row] = await this.db.update(tasks)
            .set({ ...patch, updated_at: new Date() })
            .where(and(eq(tasks.id, id), this.ofOwner(owner)))
            .returning();
        return row ?? null;
    }

    async moveTask(id: string, columnId: string, completedAt: Date | null, orderedIds: string[]): Promise<Task> {
        return this.db.transaction(async (tx) => {
            await tx.update(tasks)
                .set({ column_id: columnId, completed_at: completedAt, updated_at: new Date() })
                .where(eq(tasks.id, id));
            for (const [position, taskId] of orderedIds.entries()) {
                await tx.update(tasks).set({ position }).where(eq(tasks.id, taskId));
            }
            const [row] = await tx.select().from(tasks).where(eq(tasks.id, id));
            return row;
        });
    }

    async setArchived(owner: BoardOwner, id: string, archivedAt: Date | null): Promise<Task | null> {
        const [row] = await this.db.update(tasks)
            .set({ archived_at: archivedAt, updated_at: new Date() })
            .where(and(eq(tasks.id, id), this.ofOwner(owner)))
            .returning();
        return row ?? null;
    }

    async deleteTask(owner: BoardOwner, id: string): Promise<boolean> {
        const [row] = await this.db.delete(tasks)
            .where(and(eq(tasks.id, id), this.ofOwner(owner)))
            .returning({ id: tasks.id });
        return !!row;
    }

    async insertColumn(owner: BoardOwner, title: string, position: number): Promise<TaskColumn> {
        const [row] = await this.db.insert(taskColumns)
            .values({ company_id: owner.companyId, user_id: owner.userId, title, kind: 'custom', position })
            .returning();
        return row;
    }

    async renameCustomColumn(owner: BoardOwner, id: string, title: string): Promise<TaskColumn | null> {
        const [row] = await this.db.update(taskColumns)
            .set({ title, updated_at: new Date() })
            .where(and(
                eq(taskColumns.id, id),
                eq(taskColumns.company_id, owner.companyId),
                eq(taskColumns.user_id, owner.userId),
                eq(taskColumns.kind, 'custom'),
            ))
            .returning();
        return row ?? null;
    }

    async deleteColumnMovingTasks(id: string, destinationColumnId: string): Promise<void> {
        await this.db.transaction(async (tx) => {
            await tx.update(tasks).set({ column_id: destinationColumnId, updated_at: new Date() }).where(eq(tasks.column_id, id));
            await tx.delete(taskColumns).where(eq(taskColumns.id, id));
        });
    }

    private columnsOf(executor: Pick<DB, 'select'>, owner: BoardOwner): Promise<TaskColumn[]> {
        return executor.select().from(taskColumns)
            .where(and(eq(taskColumns.company_id, owner.companyId), eq(taskColumns.user_id, owner.userId)));
    }

    private ofOwner(owner: BoardOwner) {
        return and(eq(tasks.company_id, owner.companyId), eq(tasks.user_id, owner.userId));
    }

    private async selectTasks(where: SQL | undefined, orderBy: SQL[]): Promise<TaskWithContact[]> {
        const rows = await this.db
            .select({ task: tasks, contact_name: contacts.name, contact_number: contacts.number, contact_pic: contacts.profile_pic_url })
            .from(tasks)
            // Só contato da mesma empresa da tarefa: nunca exibe dado de outra empresa
            .leftJoin(contacts, and(eq(contacts.id, tasks.contact_id), eq(contacts.company_id, tasks.company_id)))
            .where(where)
            .orderBy(...orderBy);

        return rows.map(({ task, contact_name, contact_number, contact_pic }) => ({
            ...task,
            contact: task.contact_id != null && contact_name != null
                ? { id: task.contact_id, name: contact_name, number: contact_number, profile_pic_url: contact_pic }
                : null,
        }));
    }
}
