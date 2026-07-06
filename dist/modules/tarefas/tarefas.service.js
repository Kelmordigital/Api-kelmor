"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tarefasService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const tarefas_db_schema_1 = require("./tarefas.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const socket_1 = require("../../shared/socket");
function notifyBoard(companyId, ownerId) {
    (0, socket_1.emitToCompany)(companyId, 'tarefa:board_changed', { owner_id: ownerId });
}
const taskContactSelect = {
    id: tarefas_db_schema_1.tasks.id,
    company_id: tarefas_db_schema_1.tasks.company_id,
    user_id: tarefas_db_schema_1.tasks.user_id,
    column_id: tarefas_db_schema_1.tasks.column_id,
    contact_id: tarefas_db_schema_1.tasks.contact_id,
    titulo: tarefas_db_schema_1.tasks.titulo,
    descricao: tarefas_db_schema_1.tasks.descricao,
    due_date: tarefas_db_schema_1.tasks.due_date,
    position: tarefas_db_schema_1.tasks.position,
    completed_at: tarefas_db_schema_1.tasks.completed_at,
    archived_at: tarefas_db_schema_1.tasks.archived_at,
    created_at: tarefas_db_schema_1.tasks.created_at,
    updated_at: tarefas_db_schema_1.tasks.updated_at,
    contact_name: atendimento_db_schema_1.contacts.name,
    contact_number: atendimento_db_schema_1.contacts.number,
    contact_pic: atendimento_db_schema_1.contacts.profile_pic_url,
};
function shapeTask(row) {
    const { contact_name, contact_number, contact_pic, ...task } = row;
    return {
        ...task,
        contact: task.contact_id != null
            ? { id: task.contact_id, name: contact_name ?? '', number: contact_number, profile_pic_url: contact_pic }
            : null,
    };
}
exports.tarefasService = {
    /** Garante que o quadro do usuário tem as colunas fixas (Pilha de Ação / Concluídas). */
    async ensureBoard(companyId, userId) {
        const cols = await client_1.db
            .select()
            .from(tarefas_db_schema_1.taskColumns)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.user_id, userId)));
        const missing = [];
        if (!cols.some(c => c.kind === 'stack'))
            missing.push({ title: 'Pilha de Ação', kind: 'stack', position: 0 });
        if (!cols.some(c => c.kind === 'done'))
            missing.push({ title: 'Concluídas', kind: 'done', position: 9999 });
        if (missing.length > 0) {
            const created = await client_1.db
                .insert(tarefas_db_schema_1.taskColumns)
                .values(missing.map(m => ({ ...m, company_id: companyId, user_id: userId })))
                .returning();
            cols.push(...created);
        }
        // stack primeiro, customizadas por posição, done por último
        const rank = (c) => c.kind === 'stack' ? -1 : c.kind === 'done' ? 1 : 0;
        return cols.sort((a, b) => rank(a) - rank(b) || a.position - b.position);
    },
    async getBoard(companyId, ownerId) {
        const columns = await this.ensureBoard(companyId, ownerId);
        const rows = await client_1.db
            .select(taskContactSelect)
            .from(tarefas_db_schema_1.tasks)
            .leftJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, tarefas_db_schema_1.tasks.contact_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.user_id, ownerId), (0, drizzle_orm_1.isNull)(tarefas_db_schema_1.tasks.archived_at)))
            .orderBy((0, drizzle_orm_1.asc)(tarefas_db_schema_1.tasks.position), (0, drizzle_orm_1.desc)(tarefas_db_schema_1.tasks.created_at));
        return { columns, tasks: rows.map(shapeTask) };
    },
    async getArchived(companyId, ownerId) {
        const rows = await client_1.db
            .select(taskContactSelect)
            .from(tarefas_db_schema_1.tasks)
            .leftJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, tarefas_db_schema_1.tasks.contact_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.user_id, ownerId), (0, drizzle_orm_1.isNotNull)(tarefas_db_schema_1.tasks.archived_at)))
            .orderBy((0, drizzle_orm_1.desc)(tarefas_db_schema_1.tasks.archived_at));
        return rows.map(shapeTask);
    },
    /** Tarefas não-arquivadas de um contato no quadro do próprio usuário (widget da conversa). */
    async listByContact(companyId, userId, contactId) {
        const rows = await client_1.db
            .select(taskContactSelect)
            .from(tarefas_db_schema_1.tasks)
            .leftJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, tarefas_db_schema_1.tasks.contact_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.user_id, userId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.contact_id, contactId), (0, drizzle_orm_1.isNull)(tarefas_db_schema_1.tasks.archived_at)))
            .orderBy((0, drizzle_orm_1.asc)(tarefas_db_schema_1.tasks.completed_at), (0, drizzle_orm_1.desc)(tarefas_db_schema_1.tasks.created_at));
        return rows.map(shapeTask);
    },
    async create(companyId, userId, payload) {
        const columns = await this.ensureBoard(companyId, userId);
        const stack = columns.find(c => c.kind === 'stack');
        let columnId = stack.id;
        if (payload.column_id && columns.some(c => c.id === payload.column_id)) {
            columnId = payload.column_id;
        }
        // Entra no topo da coluna
        const colTasks = await client_1.db
            .select({ position: tarefas_db_schema_1.tasks.position })
            .from(tarefas_db_schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.column_id, columnId), (0, drizzle_orm_1.isNull)(tarefas_db_schema_1.tasks.archived_at)))
            .orderBy((0, drizzle_orm_1.asc)(tarefas_db_schema_1.tasks.position))
            .limit(1);
        const topPosition = (colTasks[0]?.position ?? 1) - 1;
        const [row] = await client_1.db
            .insert(tarefas_db_schema_1.tasks)
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
    async update(id, companyId, userId, payload) {
        const [row] = await client_1.db
            .update(tarefas_db_schema_1.tasks)
            .set({ ...payload, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.user_id, userId)))
            .returning();
        if (row)
            notifyBoard(companyId, userId);
        return row ?? null;
    },
    /** Move a tarefa para uma coluna/posição. Reindexa a coluna de destino. */
    async move(id, companyId, userId, columnId, index) {
        const [task] = await client_1.db
            .select()
            .from(tarefas_db_schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.user_id, userId)));
        if (!task)
            return null;
        const [column] = await client_1.db
            .select()
            .from(tarefas_db_schema_1.taskColumns)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.id, columnId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.user_id, userId)));
        if (!column)
            return null;
        const colTasks = (await client_1.db
            .select({ id: tarefas_db_schema_1.tasks.id })
            .from(tarefas_db_schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.column_id, columnId), (0, drizzle_orm_1.isNull)(tarefas_db_schema_1.tasks.archived_at)))
            .orderBy((0, drizzle_orm_1.asc)(tarefas_db_schema_1.tasks.position), (0, drizzle_orm_1.desc)(tarefas_db_schema_1.tasks.created_at)))
            .filter(t => t.id !== id);
        const clamped = Math.max(0, Math.min(index, colTasks.length));
        const ordered = [...colTasks.slice(0, clamped), { id }, ...colTasks.slice(clamped)];
        // Concluir/reabrir conforme a coluna de destino
        const completedAt = column.kind === 'done'
            ? (task.completed_at ?? new Date())
            : null;
        await client_1.db.transaction(async (tx) => {
            await tx
                .update(tarefas_db_schema_1.tasks)
                .set({ column_id: columnId, completed_at: completedAt, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id));
            for (let i = 0; i < ordered.length; i++) {
                await tx.update(tarefas_db_schema_1.tasks).set({ position: i }).where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, ordered[i].id));
            }
        });
        notifyBoard(companyId, userId);
        const [updated] = await client_1.db.select().from(tarefas_db_schema_1.tasks).where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id));
        return updated ?? null;
    },
    /** Concluir (move p/ Concluídas) ou reabrir (volta p/ Pilha de Ação). */
    async setDone(id, companyId, userId, done) {
        const columns = await this.ensureBoard(companyId, userId);
        const target = columns.find(c => c.kind === (done ? 'done' : 'stack'));
        return this.move(id, companyId, userId, target.id, 0);
    },
    async setArchived(id, companyId, userId, archived) {
        const [row] = await client_1.db
            .update(tarefas_db_schema_1.tasks)
            .set({ archived_at: archived ? new Date() : null, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.user_id, userId)))
            .returning();
        if (row)
            notifyBoard(companyId, userId);
        return row ?? null;
    },
    async remove(id, companyId, userId) {
        const [row] = await client_1.db
            .delete(tarefas_db_schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.user_id, userId)))
            .returning();
        if (row)
            notifyBoard(companyId, userId);
        return !!row;
    },
    // ── Colunas ──────────────────────────────────────────────────────────────
    async createColumn(companyId, userId, title) {
        const columns = await this.ensureBoard(companyId, userId);
        const maxPos = Math.max(0, ...columns.filter(c => c.kind === 'custom').map(c => c.position));
        const [row] = await client_1.db
            .insert(tarefas_db_schema_1.taskColumns)
            .values({ company_id: companyId, user_id: userId, title, kind: 'custom', position: maxPos + 1 })
            .returning();
        notifyBoard(companyId, userId);
        return row;
    },
    async renameColumn(id, companyId, userId, title) {
        const [row] = await client_1.db
            .update(tarefas_db_schema_1.taskColumns)
            .set({ title, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.id, id), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.company_id, companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.user_id, userId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.kind, 'custom')))
            .returning();
        if (row)
            notifyBoard(companyId, userId);
        return row ?? null;
    },
    /** Exclui coluna customizada; as tarefas dela voltam para a Pilha de Ação. */
    async deleteColumn(id, companyId, userId) {
        const columns = await this.ensureBoard(companyId, userId);
        const column = columns.find(c => c.id === id);
        if (!column || column.kind !== 'custom')
            return false;
        const stack = columns.find(c => c.kind === 'stack');
        await client_1.db.transaction(async (tx) => {
            await tx
                .update(tarefas_db_schema_1.tasks)
                .set({ column_id: stack.id, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.column_id, id));
            await tx.delete(tarefas_db_schema_1.taskColumns).where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.id, id));
        });
        notifyBoard(companyId, userId);
        return true;
    },
};
//# sourceMappingURL=tarefas.service.js.map