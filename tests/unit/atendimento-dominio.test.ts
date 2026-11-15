import { describe, it, expect } from 'vitest';
import { AppError } from '../../src/core/errors/http-errors';
import { TicketStatus, OPEN_TICKET_STATUSES, shouldRunBot } from '../../src/modules/atendimento/ticket-status';
import { ALLOWED_FROM, TRANSITION_MESSAGES, assertTransition, type CheckedAction } from '../../src/modules/atendimento/tickets/ticket-transitions';
import { fillMessageTemplate, whatsappTargetOf } from '../../src/modules/atendimento/tickets/automatic-messages';
import {
    AttendantLimitReachedError, ReturnTicketPermissionError, FunilStageNaoEncontradaError, TicketNaoEncontradoError,
    TransicaoNaoPermitidaError, TicketAlteradoError, ContatoNaoPertenceAoTicketError,
} from '../../src/modules/atendimento/atendimento.errors';

describe('status do ticket', () => {
    it('constantes e definição única de aberto', () => {
        expect(TicketStatus).toEqual({ Pendente: 1, Aberta: 2, Fechada: 3, Pesquisa: 7, Fluxo: 9 });
        expect(OPEN_TICKET_STATUSES).toEqual([1, 2, 7, 9]);
        expect([1, 2, 3, 7, 9].map((s) => shouldRunBot({ status_id: s }))).toEqual([false, false, false, false, true]);
    });
});

describe('tabela de transições (spec 8.1)', () => {
    const actions = Object.keys(TRANSITION_MESSAGES) as CheckedAction[];
    for (const action of actions) {
        for (const status of [1, 2, 3, 7, 9]) {
            const allowed = ALLOWED_FROM[action].includes(status);
            it(`${action} a partir de ${status}: ${allowed ? 'permitido' : '409'}`, () => {
                if (allowed) expect(() => assertTransition(action, status)).not.toThrow();
                else expect(() => assertTransition(action, status)).toThrow(new TransicaoNaoPermitidaError(TRANSITION_MESSAGES[action]));
            });
        }
    }
});

describe('erros do domínio sabem seu status HTTP', () => {
    it.each([
        [new AttendantLimitReachedError(3), 409, 'Limite de 3 atendimentos simultâneos por atendente atingido.'],
        [new AttendantLimitReachedError(), 409, 'Limite de atendimentos simultâneos atingido.'],
        [new ReturnTicketPermissionError(), 403, 'O administrador definiu que você não pode devolver ou reabrir este atendimento.'],
        [new FunilStageNaoEncontradaError(), 404, 'Etapa não encontrada.'],
        [new TicketNaoEncontradoError(), 404, 'Ticket não encontrado'],
        [new TicketAlteradoError(), 409, 'O atendimento foi alterado por outra pessoa. Atualize a tela e tente de novo.'],
        [new ContatoNaoPertenceAoTicketError(), 400, 'O contato informado não pertence a este atendimento.'],
    ])('%s', (err, status, message) => {
        expect(err).toBeInstanceOf(AppError);
        expect(err.statusCode).toBe(status);
        expect(err.message).toBe(message);
    });
});

describe('textos automáticos', () => {
    const now = new Date('2026-11-14T15:04:05Z'); // São Paulo = UTC-3 o ano todo

    it('preenche {atendente}/{ticket}/{hora} sem diferenciar maiúsculas', () => {
        expect(fillMessageTemplate('Oi {ATENDENTE}, ticket {ticket} às {hora}', { atendente: 'Ana', ticketId: 42 }, now))
            .toBe('Oi Ana, ticket 42 às 14/11/2026 12:04:05');
        expect(fillMessageTemplate('Fala {atendente}', { ticketId: 1 }, now)).toBe('Fala atendente');
    });

    it('destino no WhatsApp: número, senão LID', () => {
        expect(whatsappTargetOf({ number: '5511999990000', lid: '123' })).toBe('5511999990000');
        expect(whatsappTargetOf({ number: null, lid: '123' })).toBe('lid:123');
        expect(whatsappTargetOf(null)).toBeNull();
    });
});
