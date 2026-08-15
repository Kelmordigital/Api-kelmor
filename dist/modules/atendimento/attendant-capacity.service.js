"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendantLimitReachedError = void 0;
exports.getActiveTicketCounts = getActiveTicketCounts;
exports.attendantHasCapacity = attendantHasCapacity;
exports.filterByCapacity = filterByCapacity;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("./atendimento.db.schema");
class AttendantLimitReachedError extends Error {
    constructor(limit) {
        super(limit
            ? `Limite de ${limit} atendimentos simultâneos por atendente atingido.`
            : 'Limite de atendimentos simultâneos atingido.');
    }
}
exports.AttendantLimitReachedError = AttendantLimitReachedError;
/**
 * Conta tickets "Em Atendimento" (status_id=2) por atendente, excluindo os
 * presos numa conexão desconectada — o atendente não teria como agir neles
 * mesmo se quisesse, então não devem ocupar vaga do teto.
 */
async function getActiveTicketCounts(userIds) {
    if (userIds.length === 0)
        return new Map();
    const rows = await client_1.db
        .select({ id: atendimento_db_schema_1.tickets.attendant_user_id, total: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(atendimento_db_schema_1.tickets)
        .leftJoin(atendimento_db_schema_1.connections, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.connection_id, atendimento_db_schema_1.connections.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.attendant_user_id, userIds), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 2), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.connection_id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.status, 'connected'))))
        .groupBy(atendimento_db_schema_1.tickets.attendant_user_id);
    const map = new Map();
    for (const r of rows)
        if (r.id)
            map.set(r.id, r.total);
    return map;
}
/** Se o limite não está ativo pra empresa, todo atendente tem capacidade. */
async function attendantHasCapacity(userId, perms) {
    if (!perms.limit_services_users)
        return true;
    const counts = await getActiveTicketCounts([userId]);
    return (counts.get(userId) ?? 0) < (perms.number_limit_services_users ?? 5);
}
/** Filtra fora quem já bateu o teto, preservando a ordem original. */
async function filterByCapacity(userIds, perms) {
    if (!perms.limit_services_users || userIds.length === 0)
        return userIds;
    const counts = await getActiveTicketCounts(userIds);
    const limit = perms.number_limit_services_users ?? 5;
    return userIds.filter((id) => (counts.get(id) ?? 0) < limit);
}
//# sourceMappingURL=attendant-capacity.service.js.map