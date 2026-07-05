/**
 * Atribui automaticamente um ticket a um atendente elegível conforme o modo de
 * distribuição da fila. Retorna o id do atendente escolhido, ou undefined quando
 * não há distribuição automática ou nenhum atendente elegível (ticket fica pendente).
 *
 * Elegível = pertence à fila (userQueues) ∩ tem acesso à conexão (userConnections)
 *            ∩ está online no dashboard (isUserOnline).
 */
export declare function distributeTicket(companyId: string, queueId: number, connectionId: number | null | undefined): Promise<string | undefined>;
//# sourceMappingURL=queue-distribution.service.d.ts.map