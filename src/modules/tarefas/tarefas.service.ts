import { eq, and, asc, desc, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../../database/client';
import { taskColumns, tasks, TaskColumn, Task } from './tarefas.db.schema';
import { contacts } from '../atendimento/atendimento.db.schema';
import { emitToCompany } from '../../shared/socket';

export interface TaskWithContact extends Task {
    contact: {
        id: number;
        name: string;
        number: string | null;
        profile_pic_url: string | null;
    } | null;
}

function notifyBoard(companyId: string, ownerId: string) {
    emitToCompany(companyId, 'tarefa:board_changed', { owner_id: ownerId });
}

const taskContactSelect = {
    id: tasks.id,
    company_id: tasks.company_id,
    user_id: tasks.user_id,
    column_id: tasks.column_id,
    contact_id: tasks.contact_id,
    titulo: tasks.titulo,
    descricao: tasks.descricao,
    due_date: tasks.due_date,
    position: tasks.position,
    completed_at: tasks.completed_at,
    archived_at: tasks.archived_at,
    created_at: tasks.created_at,
    updated_at: tasks.updated_at,
    contact_name: contacts.name,
    contact_number: contacts.number,
    contact_pic: contacts.profile_pic_url,
};

type TaskContactRow = Task & {
    contact_name: string | null;
    contact_number: string | null;
    contact_pic: string | null;
};

function shapeTask(row: TaskContactRow): TaskWithContact {
    const { contact_name, contact_number, contact_pic, ...task } = row;
    return {
        ...task,
        contact: task.contact_id != null
            ? { id: task.contact_id, name: contact_name ?? '', number: contact_number, profile_pic_url: contact_pic }
            : null,
    };
}

export const tarefasService = {

    /** Garante que o quadro do usuário tem as colunas fixas (Pilha de Ação / Concluídas). */
    async ensureBoard(companyId: string, userId: string): Promise<TaskColumn[]> {
        const cols = await db
            .select()
            .from(taskColumns)
            .where(and(eq(taskColumns.company_id, companyId), eq(taskColumns.user_id, userId)));

        const missing: { title: string; kind: string; position: number }[] = [];
        if (!cols.some(c => c.kind === 'stack')) missing.push({ title: 'Pilha de Ação', kind: 'stack', position: 0 });
        if (!cols.some(c => c.kind === 'done'))  missing.push({ title: 'Concluídas',    kind: 'done',  position: 9999 });

        if (missing.length > 0) {
            const created = await db
                .insert(taskColumns)
                .values(missing.map(m => ({ ...m, company_id: companyId, user_id: userId })))
                .returning();
            cols.push(...created);
        }

        // stack primeiro, customizadas por posição, done por último
        const rank = (c: TaskColumn) => c.kind === 'stack' ? -1 : c.kind === 'done' ? 1 : 0;
        return cols.sort((a, b) => rank(a) - rank(b) || a.position - b.position);
    },

    async getBoard(companyId: string, ownerId: string): Promise<{ columns: TaskColumn[]; tasks: TaskWithContact[] }> {
        const columns = await this.ensureBoard(companyId, ownerId);

        const rows = await db
            .select(taskContactSelect)
            .from(tasks)
            .leftJoin(contacts, eq(contacts.id, tasks.contact_id))
            .where(and(
                eq(tasks.company_id, companyId),
                eq(tasks.user_id, ownerId),
                isNull(tasks.archived_at),
            ))
            .orderBy(asc(tasks.position), desc(tasks.created_at));

        return { columns, tasks: rows.map(shapeTask) };
    },

    async getArchived(companyId: string, ownerId: string): Promise<TaskWithContact[]> {
        const rows = await db
            .select(taskContactSelect)
            .from(tasks)
            .leftJoin(contacts, eq(contacts.id, tasks.contact_id))
            .where(and(
                eq(tasks.company_id, companyId),
                eq(tasks.user_id, ownerId),
                isNotNull(tasks.archived_at),
            ))
            .orderBy(desc(tasks.archived_at));

        return rows.map(shapeTask);
    },

    /** Tarefas não-arquivadas de um contato no quadro do próprio usuário (widget da conversa). */
    async listByContact(companyId: string, userId: string, contactId: number): Promise<TaskWithContact[]> {
        const rows = await db
            .select(taskContactSelect)
            .from(tasks)
            .leftJoin(contacts, eq(contacts.id, tasks.contact_id))
            .where(and(
                eq(tasks.company_id, companyId),
                eq(tasks.user_id, userId),
                eq(tasks.contact_id, contactId),
                isNull(tasks.archived_at),
            ))
            .orderBy(asc(tasks.completed_at), desc(tasks.created_at));

        return rows.map(shapeTask);
    },

    async create(companyId: string, userId: string, payload: {
        titulo: string;
        descricao?: string | null;
        contact_id?: number | null;
        due_date?: Date | null;
        column_id?: string | null;
    }): Promise<Task> {
        const columns = await this.ensureBoard(companyId, userId);
        const stack = columns.find(c => c.kind === 'stack')!;

        let columnId = stack.id;
        if (payload.column_id && columns.some(c => c.id === payload.column_id)) {
            columnId = payload.column_id;
        }

        // Entra no topo da coluna
        const colTasks = await db
            .select({ position: tasks.position })
            .from(tasks)
            .where(and(eq(tasks.column_id, columnId), isNull(tasks.archived_at)))
            .orderBy(asc(tasks.position))
            .limit(1);
        const topPosition = (colTasks[0]?.position ?? 1) - 1;

        const [row] = await db
            .insert(tasks)
            .values({
                company_id: companyId,
                user_id: userId,
                column_id: columnId,
                contact_id: payload.contact_id ?? null,
                titulo: payload.titulo,
                descricao: payload.descricao ?? null,
                due_date: payload.due_date ?? null,
                position: topPosition,
            })
            .returning();

        notifyBoard(companyId, userId);
        return row;
    },

    async update(id: string, companyId: string, userId: string, payload: Partial<Pick<Task, 'titulo' | 'descricao' | 'due_date' | 'contact_id'>>): Promise<Task | null> {
        const [row] = await db
            .update(tasks)
            .set({ ...payload, updated_at: new Date() })
            .where(and(eq(tasks.id, id), eq(tasks.company_id, companyId), eq(tasks.user_id, userId)))
            .returning();

        if (row) notifyBoard(companyId, userId);
        return row ?? null;
    },

    /** Move a tarefa para uma coluna/posição. Reindexa a coluna de destino. */
    async move(id: string, companyId: string, userId: string, columnId: string, index: number): Promise<Task | null> {
        const [task] = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, id), eq(tasks.company_id, companyId), eq(tasks.user_id, userId)));
        if (!task) return null;

        const [column] = await db
            .select()
            .from(taskColumns)
            .where(and(eq(taskColumns.id, columnId), eq(taskColumns.company_id, companyId), eq(taskColumns.user_id, userId)));
        if (!column) return null;

        const colTasks = (await db
            .select({ id: tasks.id })
            .from(tasks)
            .where(and(eq(tasks.column_id, columnId), isNull(tasks.archived_at)))
            .orderBy(asc(tasks.position), desc(tasks.created_at)))
            .filter(t => t.id !== id);

        const clamped = Math.max(0, Math.min(index, colTasks.length));
        const ordered = [...colTasks.slice(0, clamped), { id }, ...colTasks.slice(clamped)];

        // Concluir/reabrir conforme a coluna de destino
        const completedAt = column.kind === 'done'
            ? (task.completed_at ?? new Date())
            : null;

        await db.transaction(async (tx) => {
            await tx
                .update(tasks)
                .set({ column_id: columnId, completed_at: completedAt, updated_at: new Date() })
                .where(eq(tasks.id, id));
            for (let i = 0; i < ordered.length; i++) {
                await tx.update(tasks).set({ position: i }).where(eq(tasks.id, ordered[i].id));
            }
        });

        notifyBoard(companyId, userId);
        const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
        return updated ?? null;
    },

    /** Concluir (move p/ Concluídas) ou reabrir (volta p/ Pilha de Ação). */
    async setDone(id: string, companyId: string, userId: string, done: boolean): Promise<Task | null> {
        const columns = await this.ensureBoard(companyId, userId);
        const target = columns.find(c => c.kind === (done ? 'done' : 'stack'))!;
        return this.move(id, companyId, userId, target.id, 0);
    },

    async setArchived(id: string, companyId: string, userId: string, archived: boolean): Promise<Task | null> {
        const [row] = await db
            .update(tasks)
            .set({ archived_at: archived ? new Date() : null, updated_at: new Date() })
            .where(and(eq(tasks.id, id), eq(tasks.company_id, companyId), eq(tasks.user_id, userId)))
            .returning();

        if (row) notifyBoard(companyId, userId);
        return row ?? null;
    },

    async remove(id: string, companyId: string, userId: string): Promise<boolean> {
        const [row] = await db
            .delete(tasks)
            .where(and(eq(tasks.id, id), eq(tasks.company_id, companyId), eq(tasks.user_id, userId)))
            .returning();

        if (row) notifyBoard(companyId, userId);
        return !!row;
    },

    // ── Colunas ──────────────────────────────────────────────────────────────

    async createColumn(companyId: string, userId: string, title: string): Promise<TaskColumn> {
        const columns = await this.ensureBoard(companyId, userId);
        const maxPos = Math.max(0, ...columns.filter(c => c.kind === 'custom').map(c => c.position));

        const [row] = await db
            .insert(taskColumns)
            .values({ company_id: companyId, user_id: userId, title, kind: 'custom', position: maxPos + 1 })
            .returning();

        notifyBoard(companyId, userId);
        return row;
    },

    async renameColumn(id: string, companyId: string, userId: string, title: string): Promise<TaskColumn | null> {
        const [row] = await db
            .update(taskColumns)
            .set({ title, updated_at: new Date() })
            .where(and(
                eq(taskColumns.id, id),
                eq(taskColumns.company_id, companyId),
                eq(taskColumns.user_id, userId),
                eq(taskColumns.kind, 'custom'),
            ))
            .returning();

        if (row) notifyBoard(companyId, userId);
        return row ?? null;
    },

    /** Exclui coluna customizada; as tarefas dela voltam para a Pilha de Ação. */
    async deleteColumn(id: string, companyId: string, userId: string): Promise<boolean> {
        const columns = await this.ensureBoard(companyId, userId);
        const column = columns.find(c => c.id === id);
        if (!column || column.kind !== 'custom') return false;

        const stack = columns.find(c => c.kind === 'stack')!;

        await db.transaction(async (tx) => {
            await tx
                .update(tasks)
                .set({ column_id: stack.id, updated_at: new Date() })
                .where(eq(tasks.column_id, id));
            await tx.delete(taskColumns).where(eq(taskColumns.id, id));
        });

        notifyBoard(companyId, userId);
        return true;
    },
};
