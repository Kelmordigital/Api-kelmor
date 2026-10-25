import { BadRequestError } from '../../core/errors/http-errors';
import type { ScheduledMessage } from './agendamento-mensagens.db.schema';
import type { ScheduledMessageRepository } from './agendamento-mensagens.repository';
import type { Notifier } from '../notificacoes/notificacao.service';
export declare class TicketSemConexaoError extends BadRequestError {
    constructor();
}
/** Entrega o texto no WhatsApp pela conexão informada. */
export interface MessageSender {
    sendText(connectionId: number, target: string, text: string): Promise<void>;
}
/**
 * Agendamento de UMA mensagem para o contato de UM ticket (aba "Agendar
 * mensagem" do chat). Independente das campanhas (disparo em massa).
 */
export declare class AgendamentoMensagensService {
    private readonly repository;
    /** Avisado quando uma mensagem já vence ao ser criada, para sair sem esperar o próximo ciclo. */
    private readonly onDueNow;
    private readonly now;
    constructor(repository: ScheduledMessageRepository, 
    /** Avisado quando uma mensagem já vence ao ser criada, para sair sem esperar o próximo ciclo. */
    onDueNow?: () => void, now?: () => Date);
    create(companyId: string, ticketId: number, userId: string, payload: {
        message: string;
        send_date: string;
    }): Promise<ScheduledMessage>;
    /** Edita mensagem e/ou data enquanto a mensagem ainda aguarda envio. */
    update(companyId: string, id: number, input: {
        message?: string;
        send_date?: string;
    }): Promise<ScheduledMessage>;
    /** Cancela enquanto a mensagem ainda aguarda envio; ela fica no histórico como cancelada. */
    cancel(companyId: string, id: number): Promise<ScheduledMessage>;
    private changePending;
    /** Histórico de mensagens agendadas para o contato do ticket (todos os tickets dele). */
    listByTicketContact(companyId: string, ticketId: number): Promise<ScheduledMessage[]>;
    private static ticketNotFound;
}
/** Texto do aviso de falha: quem era o contato, o começo da mensagem e o motivo. */
export declare function failureNotice(message: ScheduledMessage, contactName: string | null, reason: string): {
    type: string;
    title: string;
    body: string;
    data: {
        ticket_id: number;
        contact_id: number;
        scheduled_message_id: number;
    };
};
/**
 * Envia as mensagens agendadas que venceram. Cada mensagem é reservada no
 * banco antes do envio, então várias instâncias da API podem rodar o
 * disparador ao mesmo tempo sem enviar nada em dobro. Toda falha avisa quem
 * agendou e os administradores da empresa.
 */
export declare class ScheduledMessageDispatcher {
    private readonly repository;
    private readonly sender;
    private readonly notifier;
    private readonly batchSize;
    private readonly now;
    constructor(repository: ScheduledMessageRepository, sender: MessageSender, notifier?: Notifier | null, batchSize?: number, now?: () => Date);
    /** Envia o que venceu; devolve quantas mensagens foram processadas. */
    dispatchDue(): Promise<number>;
    private deliver;
    private fail;
    /** Avisar nunca derruba o disparador. */
    private reportFailure;
}
/** Roda o disparador periodicamente, sem sobrepor execuções. */
export declare class DispatchLoop {
    private readonly dispatcher;
    private readonly intervalMs;
    private timer;
    private running;
    constructor(dispatcher: Pick<ScheduledMessageDispatcher, 'dispatchDue'>, intervalMs?: number);
    start(): void;
    stop(): void;
    /** Executa já (ex.: mensagem criada vencida); ignorado se um ciclo estiver em andamento. */
    tick(): void;
}
//# sourceMappingURL=agendamento-mensagens.service.d.ts.map