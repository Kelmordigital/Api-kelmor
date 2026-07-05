"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filaService = exports.FilaVinculadaChatbotError = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const bots_db_schema_1 = require("../bots/bots.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
const socket_1 = require("../../shared/socket");
const configuracao_geral_service_1 = require("../configuracao-geral/configuracao-geral.service");
const VALID_DISTRIBUTION = ['none', 'less_attendances', 'time', 'attendant'];
class FilaVinculadaChatbotError extends Error {
    constructor() { super('Não é possível excluir a fila, pois ela está vinculada a um chatbot.'); }
}
exports.FilaVinculadaChatbotError = FilaVinculadaChatbotError;
exports.filaService = {
    async list(companyId) {
        return client_1.db
            .select()
            .from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.queues.deleted_at)));
    },
    /** Lista paginada com busca por nome. */
    async listAll(companyId, params = {}) {
        const page = params.page ?? 1;
        const perPage = params.perPage ?? 20;
        const offset = (page - 1) * perPage;
        const conditions = [(0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.queues.deleted_at)];
        if (params.search?.trim())
            conditions.push((0, drizzle_orm_1.ilike)(atendimento_db_schema_1.queues.name, `%${params.search.trim()}%`));
        const where = (0, drizzle_orm_1.and)(...conditions);
        const [rows, countRows] = await Promise.all([
            client_1.db.select().from(atendimento_db_schema_1.queues).where(where).orderBy(atendimento_db_schema_1.queues.name).limit(perPage).offset(offset),
            client_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(atendimento_db_schema_1.queues).where(where),
        ]);
        const count = countRows[0]?.count ?? 0;
        return { queues: rows, count, page, totalPages: Math.max(1, Math.ceil(count / perPage)) };
    },
    /** Filas às quais o usuário está vinculado. */
    async listUserQueues(companyId, userId) {
        return client_1.db
            .select({
            id: atendimento_db_schema_1.queues.id, company_id: atendimento_db_schema_1.queues.company_id, name: atendimento_db_schema_1.queues.name,
            color: atendimento_db_schema_1.queues.color, enabled: atendimento_db_schema_1.queues.enabled, greeting_message: atendimento_db_schema_1.queues.greeting_message,
            distribution: atendimento_db_schema_1.queues.distribution, deleted_at: atendimento_db_schema_1.queues.deleted_at,
        })
            .from(atendimento_db_schema_1.queues)
            .innerJoin(atendimento_db_schema_1.userQueues, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.queue_id, atendimento_db_schema_1.queues.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, userId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.queues.deleted_at)))
            .orderBy(atendimento_db_schema_1.queues.name);
    },
    /** Apenas filas ativas (para seletores). */
    async listActive(companyId) {
        return client_1.db
            .select()
            .from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.enabled, true), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.queues.deleted_at)))
            .orderBy(atendimento_db_schema_1.queues.name);
    },
    async findById(id, companyId) {
        const [row] = await client_1.db
            .select()
            .from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.queues.deleted_at)))
            .limit(1);
        return row ?? null;
    },
    /**
     * Atendentes elegíveis para atender/transferir nesta fila usando esta conexão:
     * pertencem à fila E têm acesso à conexão. Se transfer_online_users estiver
     * ligado na empresa, filtra também por quem está online.
     */
    async eligibleUsers(companyId, queueId, connectionId) {
        const [inQueue, withConn, perms] = await Promise.all([
            client_1.db.select({ id: atendimento_db_schema_1.userQueues.user_id }).from(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.queue_id, queueId)),
            client_1.db.select({ id: atendimento_db_schema_1.userConnections.user_id }).from(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.connection_id, connectionId)),
            (0, configuracao_geral_service_1.getCompanyPermissions)(companyId),
        ]);
        const connSet = new Set(withConn.map((r) => r.id));
        let ids = inQueue.map((r) => r.id).filter((id) => connSet.has(id));
        if (perms.transfer_online_users)
            ids = ids.filter((id) => (0, socket_1.isUserOnline)(id));
        if (ids.length === 0)
            return [];
        return client_1.db
            .select({ id: auth_schema_1.users.id, name: auth_schema_1.users.name, email: auth_schema_1.users.email })
            .from(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId), (0, drizzle_orm_1.inArray)(auth_schema_1.users.id, ids)))
            .orderBy(auth_schema_1.users.name);
    },
    async create(companyId, payload) {
        const distribution = VALID_DISTRIBUTION.includes(payload.distribution ?? 'none')
            ? (payload.distribution ?? 'none') : 'none';
        const [row] = await client_1.db
            .insert(atendimento_db_schema_1.queues)
            .values({ company_id: companyId, ...payload, distribution })
            .returning();
        return row;
    },
    async update(id, companyId, payload) {
        if (payload.distribution !== undefined && !VALID_DISTRIBUTION.includes(payload.distribution)) {
            delete payload.distribution;
        }
        const [row] = await client_1.db
            .update(atendimento_db_schema_1.queues)
            .set(payload)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.queues.deleted_at)))
            .returning();
        if (!row)
            return null;
        // Ao desativar: remove a fila dos tickets ainda pendentes (status 1)
        if (payload.enabled === false) {
            await client_1.db.update(atendimento_db_schema_1.tickets)
                .set({ queue_id: null })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.queue_id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 1)));
        }
        return row;
    },
    /** Soft delete. Bloqueia se a fila estiver vinculada a um bot ativo. */
    async remove(id, companyId) {
        const existing = await this.findById(id, companyId);
        if (!existing)
            return false;
        // Proteção: fila referenciada por nó de transferência de bot ativo
        const [linked] = await client_1.db
            .select({ id: bots_db_schema_1.bot_nodes.id })
            .from(bots_db_schema_1.bot_nodes)
            .innerJoin(bots_db_schema_1.bots, (0, drizzle_orm_1.eq)(bots_db_schema_1.bots.id, bots_db_schema_1.bot_nodes.bot_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bots_db_schema_1.bot_nodes.queue_id, id), (0, drizzle_orm_1.eq)(bots_db_schema_1.bots.company_id, companyId), (0, drizzle_orm_1.eq)(bots_db_schema_1.bots.active, true), (0, drizzle_orm_1.isNull)(bots_db_schema_1.bots.deleted_at)))
            .limit(1);
        if (linked)
            throw new FilaVinculadaChatbotError();
        // Soft delete + desvincula tickets (coluna solta, sem cascade)
        await client_1.db.update(atendimento_db_schema_1.queues)
            .set({ deleted_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId)));
        await client_1.db.update(atendimento_db_schema_1.tickets)
            .set({ queue_id: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.queue_id, id)));
        return true;
    },
};
//# sourceMappingURL=fila.service.js.map