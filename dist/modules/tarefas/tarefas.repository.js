"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleTaskRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const tarefas_db_schema_1 = require("./tarefas.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const task_board_1 = require("./task-board");
class DrizzleTaskRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async ensureColumns(owner) {
        const existing = await this.columnsOf(this.db, owner);
        if (task_board_1.TaskBoard.missingFixedColumns(existing).length === 0)
            return task_board_1.TaskBoard.sortColumns(existing);
        return this.db.transaction(async (tx) => {
            // Serializa a criação por quadro: dois primeiros acessos simultâneos não duplicam colunas
            await tx.execute((0, drizzle_orm_1.sql) `select pg_advisory_xact_lock(hashtext(${`task-board:${owner.companyId}:${owner.userId}`}))`);
            const columns = await this.columnsOf(tx, owner);
            const missing = task_board_1.TaskBoard.missingFixedColumns(columns);
            if (missing.length > 0) {
                const created = await tx.insert(tarefas_db_schema_1.taskColumns)
                    .values(missing.map((m) => ({ ...m, company_id: owner.companyId, user_id: owner.userId })))
                    .returning();
                columns.push(...created);
            }
            return task_board_1.TaskBoard.sortColumns(columns);
        });
    }
    listTasks(owner, archived) {
        return archived
            ? this.selectTasks((0, drizzle_orm_1.and)(this.ofOwner(owner), (0, drizzle_orm_1.isNotNull)(tarefas_db_schema_1.tasks.archived_at)), [(0, drizzle_orm_1.desc)(tarefas_db_schema_1.tasks.archived_at)])
            : this.selectTasks((0, drizzle_orm_1.and)(this.ofOwner(owner), (0, drizzle_orm_1.isNull)(tarefas_db_schema_1.tasks.archived_at)), [(0, drizzle_orm_1.asc)(tarefas_db_schema_1.tasks.position), (0, drizzle_orm_1.desc)(tarefas_db_schema_1.tasks.created_at)]);
    }
    listByContact(owner, contactId) {
        return this.selectTasks((0, drizzle_orm_1.and)(this.ofOwner(owner), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.contact_id, contactId), (0, drizzle_orm_1.isNull)(tarefas_db_schema_1.tasks.archived_at)), [(0, drizzle_orm_1.asc)(tarefas_db_schema_1.tasks.completed_at), (0, drizzle_orm_1.desc)(tarefas_db_schema_1.tasks.created_at)]);
    }
    async findTask(owner, id) {
        const [row] = await this.db.select().from(tarefas_db_schema_1.tasks).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id), this.ofOwner(owner)));
        return row ?? null;
    }
    async findColumn(owner, id) {
        const [row] = await this.db.select().from(tarefas_db_schema_1.taskColumns)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.id, id), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.company_id, owner.companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.user_id, owner.userId)));
        return row ?? null;
    }
    async firstPositionIn(columnId) {
        const [row] = await this.db.select({ position: tarefas_db_schema_1.tasks.position }).from(tarefas_db_schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.column_id, columnId), (0, drizzle_orm_1.isNull)(tarefas_db_schema_1.tasks.archived_at)))
            .orderBy((0, drizzle_orm_1.asc)(tarefas_db_schema_1.tasks.position))
            .limit(1);
        return row?.position ?? null;
    }
    async activeTaskIdsIn(columnId) {
        const rows = await this.db.select({ id: tarefas_db_schema_1.tasks.id }).from(tarefas_db_schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.column_id, columnId), (0, drizzle_orm_1.isNull)(tarefas_db_schema_1.tasks.archived_at)))
            .orderBy((0, drizzle_orm_1.asc)(tarefas_db_schema_1.tasks.position), (0, drizzle_orm_1.desc)(tarefas_db_schema_1.tasks.created_at));
        return rows.map((r) => r.id);
    }
    async insertTask(owner, data) {
        const [row] = await this.db.insert(tarefas_db_schema_1.tasks)
            .values({ ...data, company_id: owner.companyId, user_id: owner.userId })
            .returning();
        return row;
    }
    async updateTask(owner, id, patch) {
        const [row] = await this.db.update(tarefas_db_schema_1.tasks)
            .set({ ...patch, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id), this.ofOwner(owner)))
            .returning();
        return row ?? null;
    }
    async moveTask(id, columnId, completedAt, orderedIds) {
        return this.db.transaction(async (tx) => {
            await tx.update(tarefas_db_schema_1.tasks)
                .set({ column_id: columnId, completed_at: completedAt, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id));
            for (const [position, taskId] of orderedIds.entries()) {
                await tx.update(tarefas_db_schema_1.tasks).set({ position }).where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, taskId));
            }
            const [row] = await tx.select().from(tarefas_db_schema_1.tasks).where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id));
            return row;
        });
    }
    async setArchived(owner, id, archivedAt) {
        const [row] = await this.db.update(tarefas_db_schema_1.tasks)
            .set({ archived_at: archivedAt, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id), this.ofOwner(owner)))
            .returning();
        return row ?? null;
    }
    async deleteTask(owner, id) {
        const [row] = await this.db.delete(tarefas_db_schema_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.id, id), this.ofOwner(owner)))
            .returning({ id: tarefas_db_schema_1.tasks.id });
        return !!row;
    }
    async insertColumn(owner, title, position) {
        const [row] = await this.db.insert(tarefas_db_schema_1.taskColumns)
            .values({ company_id: owner.companyId, user_id: owner.userId, title, kind: 'custom', position })
            .returning();
        return row;
    }
    async renameCustomColumn(owner, id, title) {
        const [row] = await this.db.update(tarefas_db_schema_1.taskColumns)
            .set({ title, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.id, id), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.company_id, owner.companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.user_id, owner.userId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.kind, 'custom')))
            .returning();
        return row ?? null;
    }
    async deleteColumnMovingTasks(id, destinationColumnId) {
        await this.db.transaction(async (tx) => {
            await tx.update(tarefas_db_schema_1.tasks).set({ column_id: destinationColumnId, updated_at: new Date() }).where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.column_id, id));
            await tx.delete(tarefas_db_schema_1.taskColumns).where((0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.id, id));
        });
    }
    columnsOf(executor, owner) {
        return executor.select().from(tarefas_db_schema_1.taskColumns)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.company_id, owner.companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.taskColumns.user_id, owner.userId)));
    }
    ofOwner(owner) {
        return (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.company_id, owner.companyId), (0, drizzle_orm_1.eq)(tarefas_db_schema_1.tasks.user_id, owner.userId));
    }
    async selectTasks(where, orderBy) {
        const rows = await this.db
            .select({ task: tarefas_db_schema_1.tasks, contact_name: atendimento_db_schema_1.contacts.name, contact_number: atendimento_db_schema_1.contacts.number, contact_pic: atendimento_db_schema_1.contacts.profile_pic_url })
            .from(tarefas_db_schema_1.tasks)
            // Só contato da mesma empresa da tarefa: nunca exibe dado de outra empresa
            .leftJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, tarefas_db_schema_1.tasks.contact_id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, tarefas_db_schema_1.tasks.company_id)))
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
exports.DrizzleTaskRepository = DrizzleTaskRepository;
//# sourceMappingURL=tarefas.repository.js.map