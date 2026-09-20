"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.distributeTicket = distributeTicket;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
const socket_1 = require("../../shared/socket");
const configuracao_geral_service_1 = require("../configuracao-geral/configuracao-geral.service");
const attendant_capacity_service_1 = require("../atendimento/attendant-capacity.service");
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/** Menor contagem vence; empate → aleatório entre os empatados. */
function pickMinCount(eligible, counts) {
    let min = Infinity;
    let winners = [];
    for (const id of eligible) {
        const c = counts.get(id) ?? 0;
        if (c < min) {
            min = c;
            winners = [id];
        }
        else if (c === min)
            winners.push(id);
    }
    return pickRandom(winners);
}
/**
 * Atribui automaticamente um ticket a um atendente elegível conforme o modo de
 * distribuição da fila. Retorna o id do atendente escolhido, ou undefined quando
 * não há distribuição automática ou nenhum atendente elegível (ticket fica pendente).
 *
 * Elegível = pertence à fila (userQueues) ∩ tem acesso à conexão (userConnections)
 *            ∩ está online no dashboard (isUserOnline).
 */
async function distributeTicket(companyId, queueId, connectionId) {
    // 1. Fila válida, ativa, não-deletada e com distribuição automática
    const [queue] = await client_1.db
        .select()
        .from(atendimento_db_schema_1.queues)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, queueId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.company_id, companyId)))
        .limit(1);
    if (!queue || queue.deleted_at || queue.enabled === false)
        return undefined;
    if (queue.distribution === 'none')
        return undefined;
    if (connectionId == null)
        return undefined;
    // 2. Conjunto elegível = fila ∩ conexão ∩ online ∩ da própria empresa
    // (userQueues/userConnections não têm company_id — sem o join em users,
    // um usuário vinculado por engano/abuso a fila/conexão de outra empresa
    // entrava na disputa e podia travar tickets alheios com ele.)
    const [inQueue, withConn] = await Promise.all([
        client_1.db.select({ id: atendimento_db_schema_1.userQueues.user_id })
            .from(atendimento_db_schema_1.userQueues)
            .innerJoin(auth_schema_1.users, (0, drizzle_orm_1.eq)(auth_schema_1.users.id, atendimento_db_schema_1.userQueues.user_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.queue_id, queueId), (0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId))),
        client_1.db.select({ id: atendimento_db_schema_1.userConnections.user_id })
            .from(atendimento_db_schema_1.userConnections)
            .innerJoin(auth_schema_1.users, (0, drizzle_orm_1.eq)(auth_schema_1.users.id, atendimento_db_schema_1.userConnections.user_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.connection_id, connectionId), (0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId))),
    ]);
    const connSet = new Set(withConn.map((r) => r.id));
    let eligible = inQueue
        .map((r) => r.id)
        .filter((id) => connSet.has(id) && (0, socket_1.isUserOnline)(id));
    if (eligible.length === 0)
        return undefined;
    // Distribuição capacity-aware: quem já bateu o teto de atendimentos
    // simultâneos (config "Limitar atendimentos por usuário") sai da disputa
    // antes do ranking — a distribuição automática nunca empurra ticket pra
    // quem não tem vaga, mesmo sendo o "melhor" candidato relativo aos outros.
    const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
    eligible = await (0, attendant_capacity_service_1.filterByCapacity)(eligible, perms);
    if (eligible.length === 0)
        return undefined;
    if (eligible.length === 1)
        return eligible[0];
    // 3. Ranking por modo
    if (queue.distribution === 'less_attendances' || queue.distribution === 'time') {
        const statusId = queue.distribution === 'less_attendances' ? 2 : 3;
        const rows = await client_1.db
            .select({ id: atendimento_db_schema_1.tickets.attendant_user_id, total: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.queue_id, queueId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, statusId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.attendant_user_id, eligible)))
            .groupBy(atendimento_db_schema_1.tickets.attendant_user_id);
        const counts = new Map();
        for (const r of rows)
            if (r.id)
                counts.set(r.id, r.total);
        return pickMinCount(eligible, counts);
    }
    if (queue.distribution === 'attendant') {
        // Mais ocioso: quem não tem ticket na fila = prioridade máxima;
        // senão, o de atividade mais antiga (MAX(updated_at) mais antigo).
        const rows = await client_1.db
            .select({ id: atendimento_db_schema_1.tickets.attendant_user_id, last: (0, drizzle_orm_1.sql) `max(${atendimento_db_schema_1.tickets.updated_at})` })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.queue_id, queueId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.attendant_user_id, eligible)))
            .groupBy(atendimento_db_schema_1.tickets.attendant_user_id);
        const lastActivity = new Map();
        for (const r of rows)
            if (r.id && r.last)
                lastActivity.set(r.id, new Date(r.last).getTime());
        const zeroTicket = eligible.filter((id) => !lastActivity.has(id));
        if (zeroTicket.length)
            return pickRandom(zeroTicket);
        let oldest = Infinity;
        let winners = [];
        for (const id of eligible) {
            const t = lastActivity.get(id) ?? Infinity;
            if (t < oldest) {
                oldest = t;
                winners = [id];
            }
            else if (t === oldest)
                winners.push(id);
        }
        return pickRandom(winners);
    }
    return undefined;
}
//# sourceMappingURL=queue-distribution.service.js.map