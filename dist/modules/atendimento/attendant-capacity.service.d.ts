export declare class AttendantLimitReachedError extends Error {
    constructor(limit?: number);
}
type LimitPerms = {
    limit_services_users: boolean;
    number_limit_services_users: number | null;
};
/**
 * Conta tickets "Em Atendimento" (status_id=2) por atendente, excluindo os
 * presos numa conexão desconectada — o atendente não teria como agir neles
 * mesmo se quisesse, então não devem ocupar vaga do teto.
 */
export declare function getActiveTicketCounts(userIds: string[]): Promise<Map<string, number>>;
/** Se o limite não está ativo pra empresa, todo atendente tem capacidade. */
export declare function attendantHasCapacity(userId: string, perms: LimitPerms): Promise<boolean>;
/** Filtra fora quem já bateu o teto, preservando a ordem original. */
export declare function filterByCapacity(userIds: string[], perms: LimitPerms): Promise<string[]>;
export {};
//# sourceMappingURL=attendant-capacity.service.d.ts.map