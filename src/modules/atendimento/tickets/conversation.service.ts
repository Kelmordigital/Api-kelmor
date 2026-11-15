import { eq, and, inArray, isNull, desc } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import type { CompanyPermissionsReader } from '../../configuracao-geral/configuracao-geral.service';
import type { QueueRouting } from '../../filas/fila.module';
import { tickets, type Ticket } from '../atendimento.db.schema';
import type { AtendimentoEvents, ConversationTickets, DefaultBotLookup, MessageRecorder } from '../atendimento.ports';
import { OPEN_TICKET_STATUSES } from '../ticket-status';
import type { FunilStageService } from '../funil/funil-stage.service';
import type { TicketAssignmentService } from './ticket-assignment.service';

/** A conversa em aberto do contato: onde cai cada mensagem nova. */
export class ConversationService implements ConversationTickets {
    constructor(
        private readonly db: DbExecutor,
        private readonly perms: CompanyPermissionsReader,
        private readonly bots: DefaultBotLookup,
        private readonly stages: Pick<FunilStageService, 'listStages' | 'recordStageEntry'>,
        private readonly queues: Pick<QueueRouting, 'activeQueuesOfConnection'>,
        private readonly assignment: Pick<TicketAssignmentService, 'routeToQueue'>,
        private readonly recorder: MessageRecorder,
        private readonly events: AtendimentoEvents,
    ) {}

    /** Ticket aberto do contato na mesma conexão (sem conexão → só tickets sem conexão). */
    async findOpenTicket(companyId: string, contactId: number, connectionId?: number): Promise<Ticket | null> {
        const [existing] = await this.db.select().from(tickets).where(and(
            eq(tickets.company_id, companyId),
            eq(tickets.contact_id, contactId),
            connectionId ? eq(tickets.connection_id, connectionId) : isNull(tickets.connection_id),
            inArray(tickets.status_id, [...OPEN_TICKET_STATUSES]),
            isNull(tickets.deleted_at),
        )).orderBy(desc(tickets.updated_at)).limit(1);
        return existing ?? null;
    }

    /**
     * Ticket aberto do contato ou um novo. Cada atendimento fechado é definitivo: nunca
     * reabre o antigo (preserva vendas por atendimento; o histórico é a timeline da tela).
     */
    async findOrCreateOpen(companyId: string, contactId: number, connectionId?: number, serializedId?: string, origin = 'Base de contatos'): Promise<{ ticket: Ticket; created: boolean }> {
        const existing = await this.findOpenTicket(companyId, contactId, connectionId);
        if (existing) return { ticket: existing, created: false };

        const hasBot = await this.bots.hasDefaultActiveBot(companyId);
        const [created] = await this.db.insert(tickets).values({
            company_id: companyId, contact_id: contactId, connection_id: connectionId ?? null,
            serialized_id: serializedId ?? null, origin, status_id: hasBot ? 9 : 1,
        }).returning();
        this.events.ticketCreated(companyId, created);

        // Gráfico de conversão do Kanban: só para empresas com o Kanban ligado.
        if ((await this.perms.forCompany(companyId)).active_kanban) {
            const waitingStage = (await this.stages.listStages(companyId)).find((s) => s.is_waiting_stage)!;
            await this.stages.recordStageEntry(companyId, created.id, waitingStage.id);
        }

        // Sem bot: conexão com exatamente 1 fila ativa → o ticket já nasce roteado pra ela.
        if (!hasBot && connectionId) {
            const activeQueues = await this.queues.activeQueuesOfConnection(connectionId);
            if (activeQueues.length === 1) {
                const routed = await this.assignment.routeToQueue(created.id, companyId, activeQueues[0].id);
                if (routed) return { ticket: routed, created: true };
            }
        }
        return { ticket: created, created: true };
    }

    /**
     * Vincula uma mensagem enviada por FORA do atendimento humano (API transacional) ao
     * histórico do contato: reaproveita o ticket aberto da conexão ou cria um já FECHADO,
     * sem atendente, que nunca entra em fila/bot.
     */
    async attachExternalMessage(companyId: string, contactId: number, connectionId: number, body: string): Promise<Ticket> {
        let ticket = await this.findOpenTicket(companyId, contactId, connectionId);
        if (!ticket) {
            [ticket] = await this.db.insert(tickets).values({
                company_id: companyId, contact_id: contactId, connection_id: connectionId, status_id: 3, origin: 'API',
            }).returning();
            this.events.ticketCreated(companyId, ticket);
        }
        await this.recorder.save(ticket.id, contactId, body, true, companyId, {});
        return ticket;
    }
}
