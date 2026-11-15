import { TransicaoNaoPermitidaError } from '../atendimento.errors';

/** Ações que mudam o status do ticket e de quais status cada uma pode partir (spec 8.1). */
export type TicketAction = 'assumir' | 'devolver' | 'transferir' | 'fechar' | 'fecharComPesquisa' | 'reabrir' | 'finalizarPesquisa';

export const ALLOWED_FROM: Record<TicketAction, readonly number[]> = {
    assumir: [1, 9],
    devolver: [2],
    transferir: [2],
    fechar: [1, 2, 7, 9],
    fecharComPesquisa: [1, 2, 9],
    reabrir: [3],
    finalizarPesquisa: [7],
};

export const TRANSITION_MESSAGES = {
    devolver: 'Só é possível devolver um atendimento que está aberto.',
    transferir: 'Só é possível transferir um atendimento que está aberto.',
    fechar: 'Este atendimento já está fechado.',
    fecharComPesquisa: 'Este atendimento já está fechado ou aguardando a resposta da pesquisa.',
    reabrir: 'Só é possível reabrir um atendimento fechado.',
} as const;

export type CheckedAction = keyof typeof TRANSITION_MESSAGES;

export function canTransition(action: TicketAction, currentStatus: number): boolean {
    return ALLOWED_FROM[action].includes(currentStatus);
}

export function assertTransition(action: CheckedAction, currentStatus: number): void {
    if (!canTransition(action, currentStatus)) throw new TransicaoNaoPermitidaError(TRANSITION_MESSAGES[action]);
}
