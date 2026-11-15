/** Status de ticket (o código é a fonte da verdade; a tabela at_statuses não é usada pela aplicação). */
export const TicketStatus = { Pendente: 1, Aberta: 2, Fechada: 3, Pesquisa: 7, Fluxo: 9 } as const;

/** "O contato já tem um atendimento em aberto?" — mensagem nova, conflito do reabrir e fusão de LID. */
export const OPEN_TICKET_STATUSES: readonly number[] = [1, 2, 7, 9];

/** O bot só processa mensagens enquanto o ticket está em Fluxo (9). */
export function shouldRunBot(ticket: { status_id: number }): boolean {
    return ticket.status_id === TicketStatus.Fluxo;
}
