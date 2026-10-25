"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchLoop = exports.ScheduledMessageDispatcher = exports.AgendamentoMensagensService = exports.TicketSemConexaoError = void 0;
exports.failureNotice = failureNotice;
const http_errors_1 = require("../../core/errors/http-errors");
class TicketSemConexaoError extends http_errors_1.BadRequestError {
    constructor() { super('Este ticket não tem uma conexão associada — não é possível agendar mensagem.'); }
}
exports.TicketSemConexaoError = TicketSemConexaoError;
/**
 * Agendamento de UMA mensagem para o contato de UM ticket (aba "Agendar
 * mensagem" do chat). Independente das campanhas (disparo em massa).
 */
class AgendamentoMensagensService {
    repository;
    onDueNow;
    now;
    constructor(repository, 
    /** Avisado quando uma mensagem já vence ao ser criada, para sair sem esperar o próximo ciclo. */
    onDueNow = () => { }, now = () => new Date()) {
        this.repository = repository;
        this.onDueNow = onDueNow;
        this.now = now;
    }
    async create(companyId, ticketId, userId, payload) {
        const ticket = await this.repository.findTicket(ticketId, companyId);
        if (!ticket)
            throw AgendamentoMensagensService.ticketNotFound();
        if (!ticket.connection_id)
            throw new TicketSemConexaoError();
        const row = await this.repository.create({
            company_id: companyId,
            ticket_id: ticketId,
            contact_id: ticket.contact_id,
            connection_id: ticket.connection_id,
            created_by: userId,
            message: payload.message,
            send_date: new Date(payload.send_date),
        });
        if (row.send_date.getTime() <= this.now().getTime())
            this.onDueNow();
        return row;
    }
    /** Edita mensagem e/ou data enquanto a mensagem ainda aguarda envio. */
    async update(companyId, id, input) {
        const row = await this.changePending(companyId, id, {
            ...(input.message !== undefined ? { message: input.message } : {}),
            ...(input.send_date !== undefined ? { send_date: new Date(input.send_date) } : {}),
        });
        if (row.send_date.getTime() <= this.now().getTime())
            this.onDueNow();
        return row;
    }
    /** Cancela enquanto a mensagem ainda aguarda envio; ela fica no histórico como cancelada. */
    cancel(companyId, id) {
        return this.changePending(companyId, id, { status: 'canceled' });
    }
    async changePending(companyId, id, patch) {
        const row = await this.repository.updatePending(id, companyId, patch);
        if (row)
            return row;
        if (!(await this.repository.findById(id, companyId)))
            throw new http_errors_1.NotFoundError('Agendamento não encontrado');
        throw new http_errors_1.ConflictError('Esta mensagem não pode mais ser alterada: ela já foi enviada, cancelada ou está sendo enviada.');
    }
    /** Histórico de mensagens agendadas para o contato do ticket (todos os tickets dele). */
    async listByTicketContact(companyId, ticketId) {
        const ticket = await this.repository.findTicket(ticketId, companyId);
        if (!ticket)
            throw AgendamentoMensagensService.ticketNotFound();
        return this.repository.listByContact(companyId, ticket.contact_id);
    }
    static ticketNotFound() {
        return new http_errors_1.NotFoundError('Ticket não encontrado');
    }
}
exports.AgendamentoMensagensService = AgendamentoMensagensService;
/** Depois disso, um envio preso em "sending" (servidor caiu no meio) é dado como falho. */
const STUCK_AFTER_MS = 10 * 60_000;
/** Texto do aviso de falha: quem era o contato, o começo da mensagem e o motivo. */
function failureNotice(message, contactName, reason) {
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
class ScheduledMessageDispatcher {
    repository;
    sender;
    notifier;
    batchSize;
    now;
    constructor(repository, sender, notifier = null, batchSize = 50, now = () => new Date()) {
        this.repository = repository;
        this.sender = sender;
        this.notifier = notifier;
        this.batchSize = batchSize;
        this.now = now;
    }
    /** Envia o que venceu; devolve quantas mensagens foram processadas. */
    async dispatchDue() {
        const now = this.now();
        const interrupted = 'Envio interrompido (o servidor reiniciou durante o envio)';
        for (const stuck of await this.repository.failStuck(new Date(now.getTime() - STUCK_AFTER_MS), interrupted)) {
            await this.reportFailure(stuck, interrupted);
        }
        const due = await this.repository.claimDue(now, this.batchSize);
        for (const message of due)
            await this.deliver(message);
        return due.length;
    }
    async deliver(message) {
        let contactName = null;
        try {
            const contact = await this.repository.contactInfo(message.contact_id);
            contactName = contact.name;
            if (!contact.target) {
                await this.fail(message, 'Contato sem número/LID', contactName);
                return;
            }
            await this.sender.sendText(message.connection_id, contact.target, message.message);
            await this.repository.markSent(message.id, this.now());
        }
        catch (err) {
            await this.fail(message, String(err instanceof Error ? err.message : err), contactName);
        }
    }
    async fail(message, reason, contactName) {
        await this.repository.markFailed(message.id, reason);
        await this.reportFailure(message, reason, contactName);
    }
    /** Avisar nunca derruba o disparador. */
    async reportFailure(message, reason, contactName) {
        if (!this.notifier)
            return;
        try {
            const name = contactName !== undefined ? contactName : (await this.repository.contactInfo(message.contact_id)).name;
            await this.notifier.notify({ companyId: message.company_id, userIds: [message.created_by], includeAdmins: true }, failureNotice(message, name, reason));
        }
        catch (err) {
            console.error(`[ScheduledMessage] Falha ao notificar o erro do agendamento #${message.id}:`, err instanceof Error ? err.message : err);
        }
    }
}
exports.ScheduledMessageDispatcher = ScheduledMessageDispatcher;
/** Roda o disparador periodicamente, sem sobrepor execuções. */
class DispatchLoop {
    dispatcher;
    intervalMs;
    timer = null;
    running = false;
    constructor(dispatcher, intervalMs = 30_000) {
        this.dispatcher = dispatcher;
        this.intervalMs = intervalMs;
    }
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => this.tick(), this.intervalMs);
        this.timer.unref();
        this.tick();
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
    }
    /** Executa já (ex.: mensagem criada vencida); ignorado se um ciclo estiver em andamento. */
    tick() {
        if (this.running)
            return;
        this.running = true;
        this.dispatcher.dispatchDue()
            .catch((err) => console.error('[ScheduledMessage] Erro no disparador:', err instanceof Error ? err.message : err))
            .finally(() => { this.running = false; });
    }
}
exports.DispatchLoop = DispatchLoop;
//# sourceMappingURL=agendamento-mensagens.service.js.map