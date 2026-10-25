import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors/http-errors';
import type { ScheduledMessage } from './agendamento-mensagens.db.schema';
import type { ScheduledMessageRepository } from './agendamento-mensagens.repository';
import type { Notifier } from '../notificacoes/notificacao.service';

export class TicketSemConexaoError extends BadRequestError {
    constructor() { super('Este ticket não tem uma conexão associada — não é possível agendar mensagem.'); }
}

/** Entrega o texto no WhatsApp pela conexão informada. */
export interface MessageSender {
    sendText(connectionId: number, target: string, text: string): Promise<void>;
}

/**
 * Agendamento de UMA mensagem para o contato de UM ticket (aba "Agendar
 * mensagem" do chat). Independente das campanhas (disparo em massa).
 */
export class AgendamentoMensagensService {
    constructor(
        private readonly repository: ScheduledMessageRepository,
        /** Avisado quando uma mensagem já vence ao ser criada, para sair sem esperar o próximo ciclo. */
        private readonly onDueNow: () => void = () => {},
        private readonly now: () => Date = () => new Date(),
    ) {}

    async create(companyId: string, ticketId: number, userId: string, payload: { message: string; send_date: string }): Promise<ScheduledMessage> {
        const ticket = await this.repository.findTicket(ticketId, companyId);
        if (!ticket) throw AgendamentoMensagensService.ticketNotFound();
        if (!ticket.connection_id) throw new TicketSemConexaoError();

        const row = await this.repository.create({
            company_id:    companyId,
            ticket_id:     ticketId,
            contact_id:    ticket.contact_id,
            connection_id: ticket.connection_id,
            created_by:    userId,
            message:       payload.message,
            send_date:     new Date(payload.send_date),
        });
        if (row.send_date.getTime() <= this.now().getTime()) this.onDueNow();
        return row;
    }

    /** Edita mensagem e/ou data enquanto a mensagem ainda aguarda envio. */
    async update(companyId: string, id: number, input: { message?: string; send_date?: string }): Promise<ScheduledMessage> {
        const row = await this.changePending(companyId, id, {
            ...(input.message !== undefined ? { message: input.message } : {}),
            ...(input.send_date !== undefined ? { send_date: new Date(input.send_date) } : {}),
        });
        if (row.send_date.getTime() <= this.now().getTime()) this.onDueNow();
        return row;
    }

    /** Cancela enquanto a mensagem ainda aguarda envio; ela fica no histórico como cancelada. */
    cancel(companyId: string, id: number): Promise<ScheduledMessage> {
        return this.changePending(companyId, id, { status: 'canceled' });
    }

    private async changePending(companyId: string, id: number, patch: { message?: string; send_date?: Date; status?: 'canceled' }) {
        const row = await this.repository.updatePending(id, companyId, patch);
        if (row) return row;
        if (!(await this.repository.findById(id, companyId))) throw new NotFoundError('Agendamento não encontrado');
        throw new ConflictError('Esta mensagem não pode mais ser alterada: ela já foi enviada, cancelada ou está sendo enviada.');
    }

    /** Histórico de mensagens agendadas para o contato do ticket (todos os tickets dele). */
    async listByTicketContact(companyId: string, ticketId: number): Promise<ScheduledMessage[]> {
        const ticket = await this.repository.findTicket(ticketId, companyId);
        if (!ticket) throw AgendamentoMensagensService.ticketNotFound();
        return this.repository.listByContact(companyId, ticket.contact_id);
    }

    private static ticketNotFound() {
        return new NotFoundError('Ticket não encontrado');
    }
}

/** Depois disso, um envio preso em "sending" (servidor caiu no meio) é dado como falho. */
const STUCK_AFTER_MS = 10 * 60_000;

/** Texto do aviso de falha: quem era o contato, o começo da mensagem e o motivo. */
export function failureNotice(message: ScheduledMessage, contactName: string | null, reason: string) {
    const preview = message.message.length > 80 ? `${message.message.slice(0, 80)}…` : message.message;
    return {
        type: 'scheduled_message_failed',
        title: 'Mensagem agendada não foi enviada',
        body: `${contactName ?? 'Contato'}: "${preview}" — ${reason}`,
        data: { ticket_id: message.ticket_id, contact_id: message.contact_id, scheduled_message_id: message.id },
    };
}

/**
 * Envia as mensagens agendadas que venceram. Cada mensagem é reservada no
 * banco antes do envio, então várias instâncias da API podem rodar o
 * disparador ao mesmo tempo sem enviar nada em dobro. Toda falha avisa quem
 * agendou e os administradores da empresa.
 */
export class ScheduledMessageDispatcher {
    constructor(
        private readonly repository: ScheduledMessageRepository,
        private readonly sender: MessageSender,
        private readonly notifier: Notifier | null = null,
        private readonly batchSize = 50,
        private readonly now: () => Date = () => new Date(),
    ) {}

    /** Envia o que venceu; devolve quantas mensagens foram processadas. */
    async dispatchDue(): Promise<number> {
        const now = this.now();
        const interrupted = 'Envio interrompido (o servidor reiniciou durante o envio)';
        for (const stuck of await this.repository.failStuck(new Date(now.getTime() - STUCK_AFTER_MS), interrupted)) {
            await this.reportFailure(stuck, interrupted);
        }

        const due = await this.repository.claimDue(now, this.batchSize);
        for (const message of due) await this.deliver(message);
        return due.length;
    }

    private async deliver(message: ScheduledMessage): Promise<void> {
        let contactName: string | null = null;
        try {
            const contact = await this.repository.contactInfo(message.contact_id);
            contactName = contact.name;
            if (!contact.target) {
                await this.fail(message, 'Contato sem número/LID', contactName);
                return;
            }
            await this.sender.sendText(message.connection_id, contact.target, message.message);
            await this.repository.markSent(message.id, this.now());
        } catch (err) {
            await this.fail(message, String(err instanceof Error ? err.message : err), contactName);
        }
    }

    private async fail(message: ScheduledMessage, reason: string, contactName: string | null): Promise<void> {
        await this.repository.markFailed(message.id, reason);
        await this.reportFailure(message, reason, contactName);
    }

    /** Avisar nunca derruba o disparador. */
    private async reportFailure(message: ScheduledMessage, reason: string, contactName?: string | null): Promise<void> {
        if (!this.notifier) return;
        try {
            const name = contactName !== undefined ? contactName : (await this.repository.contactInfo(message.contact_id)).name;
            await this.notifier.notify(
                { companyId: message.company_id, userIds: [message.created_by], includeAdmins: true },
                failureNotice(message, name, reason),
            );
        } catch (err) {
            console.error(`[ScheduledMessage] Falha ao notificar o erro do agendamento #${message.id}:`, err instanceof Error ? err.message : err);
        }
    }
}

/** Roda o disparador periodicamente, sem sobrepor execuções. */
export class DispatchLoop {
    private timer: NodeJS.Timeout | null = null;
    private running = false;

    constructor(
        private readonly dispatcher: Pick<ScheduledMessageDispatcher, 'dispatchDue'>,
        private readonly intervalMs = 30_000,
    ) {}

    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), this.intervalMs);
        this.timer.unref();
        this.tick();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** Executa já (ex.: mensagem criada vencida); ignorado se um ciclo estiver em andamento. */
    tick(): void {
        if (this.running) return;
        this.running = true;
        this.dispatcher.dispatchDue()
            .catch((err) => console.error('[ScheduledMessage] Erro no disparador:', err instanceof Error ? err.message : err))
            .finally(() => { this.running = false; });
    }
}
