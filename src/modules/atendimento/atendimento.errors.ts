import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/http-errors';

/** Erros do domínio do atendimento: cada um já sabe seu status HTTP (o errorHandler responde). */

export class AttendantLimitReachedError extends ConflictError {
    constructor(limit?: number) {
        super(limit
            ? `Limite de ${limit} atendimentos simultâneos por atendente atingido.`
            : 'Limite de atendimentos simultâneos atingido.');
    }
}

/** Falhas esperadas ao aceitar um ticket (já assumido por outro, não encontrado). */
export class TicketAssignConflictError extends ConflictError {}

export class AtendenteNaoElegivelError extends ConflictError {
    constructor() { super('O atendente selecionado não pertence à fila de destino.'); }
}

export class TransferenciaParaSiMesmoError extends ConflictError {
    constructor() { super('Não é possível transferir o atendimento para o mesmo atendente.'); }
}

export class ReturnTicketPermissionError extends ForbiddenError {
    constructor() { super('O administrador definiu que você não pode devolver ou reabrir este atendimento.'); }
}

export class SpyTicketPermissionError extends ForbiddenError {
    constructor() { super('Você não tem permissão para visualizar este atendimento.'); }
}

export class FunilDestinoInvalidoError extends ConflictError {}

export class FunilMovimentoNaoAutorizadoError extends ForbiddenError {
    constructor() { super('Só quem está atendendo (ou um admin) pode mover este card entre colunas.'); }
}

export class FunilStageProtegidaError extends ForbiddenError {
    constructor() { super('Esta etapa é fixa e não pode ser alterada ou excluída.'); }
}

export class FunilStageNomeDuplicadoError extends ConflictError {
    constructor() { super('Já existe uma etapa com esse nome.'); }
}

export class FunilStageComTicketsError extends ConflictError {
    constructor() { super('Não é possível excluir uma etapa com atendimentos nela.'); }
}

export class FunilStageNaoEncontradaError extends NotFoundError {
    constructor() { super('Etapa não encontrada.'); }
}

export class TicketNaoEncontradoError extends NotFoundError {
    constructor() { super('Ticket não encontrado'); }
}

export class AtendenteDestinoNaoEncontradoError extends NotFoundError {
    constructor() { super('Atendente destino não encontrado'); }
}

export class PesquisaNaoConfiguradaError extends BadRequestError {
    constructor() { super('Nenhuma pesquisa de satisfação configurada para este atendimento'); }
}

export class AceiteAntesDeEnviarError extends ConflictError {
    constructor() { super('Aceite o atendimento antes de enviar mensagens.'); }
}

export class TicketAbertoParaContatoError extends ConflictError {
    constructor() { super('Já existe um atendimento aberto para este contato nesta conexão.'); }
}

export class TransicaoNaoPermitidaError extends ConflictError {}

export class TicketAlteradoError extends ConflictError {
    constructor() { super('O atendimento foi alterado por outra pessoa. Atualize a tela e tente de novo.'); }
}

export class ContatoNaoPertenceAoTicketError extends BadRequestError {
    constructor() { super('O contato informado não pertence a este atendimento.'); }
}

export class EtapaInvalidaError extends BadRequestError {
    constructor() { super('Escolha uma etapa do meio do funil desta empresa.'); }
}
