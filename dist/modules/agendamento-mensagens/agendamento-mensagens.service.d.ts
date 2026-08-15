import { ScheduledMessage } from './agendamento-mensagens.db.schema';
export declare class TicketSemConexaoError extends Error {
    constructor();
}
export declare const agendamentoMensagensService: {
    /** Agenda UMA mensagem para o contato do ticket informado. */
    create(companyId: string, ticketId: number, userId: string, payload: {
        message: string;
        send_date: string;
    }): Promise<ScheduledMessage>;
    /** Histórico de mensagens agendadas para o contato do ticket informado (todas as filas/tickets dele). */
    listByTicketContact(companyId: string, ticketId: number): Promise<ScheduledMessage[]>;
};
//# sourceMappingURL=agendamento-mensagens.service.d.ts.map