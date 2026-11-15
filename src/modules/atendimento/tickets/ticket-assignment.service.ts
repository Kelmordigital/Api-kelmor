import { eq, and, ne, inArray, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import type { CompanyPermissionsReader } from '../../configuracao-geral/configuracao-geral.service';
import type { QueueRouting } from '../../filas/fila.module';
import { users } from '../../auth/auth.schema';
import { tickets, historic_tickets, atendimento_messages, type Ticket } from '../atendimento.db.schema';
import type { AtendimentoEvents } from '../atendimento.ports';
import { OPEN_TICKET_STATUSES } from '../ticket-status';
import {
    AtendenteDestinoNaoEncontradoError, AtendenteNaoElegivelError, AttendantLimitReachedError, ReturnTicketPermissionError,
    TicketAbertoParaContatoError, TicketAlteradoError, TicketAssignConflictError, TicketNaoEncontradoError, TransferenciaParaSiMesmoError,
} from '../atendimento.errors';
import { ALLOWED_FROM, assertTransition } from './ticket-transitions';
import { AttendantCapacity } from './attendant-capacity';
import { isAdminTag } from './ticket-access';
import type { AttendantLock } from './attendant-lock';
import type { AutomaticMessages } from './automatic-messages';

type TicketPatch = Partial<typeof tickets.$inferInsert>;

/** Busca o ticket da empresa ou 404. */
export async function loadTicket(db: DbExecutor, ticketId: number, companyId: string): Promise<Ticket> {
    const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId))).limit(1);
    if (!ticket) throw new TicketNaoEncontradoError();
    return ticket;
}

/**
 * Update condicionado ao status lido: se outra pessoa mudou o ticket no meio do
 * caminho (outra cópia da API, duplo clique), nada é gravado e a ação falha com 409.
 */
export async function updateIfStatus(db: DbExecutor, ticketId: number, companyId: string, expectedStatus: number, patch: TicketPatch): Promise<Ticket> {
    const [updated] = await db.update(tickets).set(patch)
        .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId), eq(tickets.status_id, expectedStatus)))
        .returning();
    if (!updated) throw new TicketAlteradoError();
    return updated;
}

export async function insertHistory(db: DbExecutor, ticketId: number, userId: string | null, from: number, to: number): Promise<void> {
    await db.insert(historic_tickets).values({ ticket_id: ticketId, user_id: userId, status_id_init: from, status_id_end: to });
}

/** Quem atende o ticket: assumir, rotear para fila, devolver, reabrir e transferir. */
export class TicketAssignmentService {
    constructor(
        private readonly db: DbExecutor,
        private readonly lock: AttendantLock,
        private readonly perms: CompanyPermissionsReader,
        private readonly queues: QueueRouting,
        private readonly events: AtendimentoEvents,
        private readonly automatic: Pick<AutomaticMessages, 'sendOpening' | 'sendQueueGreeting' | 'sendTransfer'>,
    ) {}

    /** admin/superAdmin sempre podem; atendente comum depende de company_permissions.return_ticket. */
    private async ensureReturnPermission(companyId: string, profileTag: string): Promise<void> {
        if (isAdminTag(profileTag)) return;
        if (!(await this.perms.forCompany(companyId)).return_ticket) throw new ReturnTicketPermissionError();
    }

    /**
     * Atendente assume o ticket (Pendente 1 ou Fluxo 9 → Aberta 2). Update atômico condicional:
     * bot rodando em paralelo ou outro atendente nunca vencem a corrida em silêncio. Com limite
     * de atendimentos, serializa por atendente (trava no Postgres, vale entre réplicas).
     */
    async assignAttendant(ticketId: number, userId: string, companyId: string): Promise<Ticket> {
        const perms = await this.perms.forCompany(companyId);
        const updated = await this.lock.run(userId, perms.limit_services_users, async (tx) => {
            const [current] = await tx.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId))).limit(1);
            if (!current) throw new TicketAssignConflictError('Ticket não encontrado');
            if (!(await new AttendantCapacity(tx).hasCapacity(userId, perms))) {
                throw new AttendantLimitReachedError(perms.number_limit_services_users ?? undefined);
            }
            const [assigned] = await tx.update(tickets)
                .set({ status_id: 2, attendant_user_id: userId, updated_at: new Date() })
                .where(and(
                    eq(tickets.id, ticketId), eq(tickets.company_id, companyId),
                    inArray(tickets.status_id, [...ALLOWED_FROM.assumir]), isNull(tickets.attendant_user_id),
                ))
                .returning();
            if (!assigned) throw new TicketAssignConflictError('Ticket já foi assumido por outro atendente ou não está mais disponível');
            await insertHistory(tx, ticketId, userId, current.status_id, 2);
            return assigned;
        });

        this.events.ticketUpdated(companyId, updated);
        this.automatic.sendOpening(updated, userId, perms).catch(() => {});
        return updated;
    }

    /**
     * Roteia o ticket para uma fila (bot ou roteamento automático). Com distribuição automática
     * e atendente elegível/online, já atribui (→ 2); senão fica pendente na fila.
     */
    async routeToQueue(ticketId: number, companyId: string, queueId: number): Promise<Ticket | null> {
        const [current] = await this.db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId))).limit(1);
        if (!current) return null;
        if (current.status_id === 2 && current.attendant_user_id) return current; // não rouba ticket em atendimento

        const chosen = await this.queues.distribute(companyId, queueId, current.connection_id);
        if (chosen) await insertHistory(this.db, ticketId, chosen, current.status_id, 2);

        const [updated] = await this.db.update(tickets)
            .set({ queue_id: queueId, ...(chosen ? { status_id: 2, attendant_user_id: chosen } : {}), updated_at: new Date() })
            .where(eq(tickets.id, ticketId))
            .returning();
        this.events.ticketUpdated(companyId, updated);

        // Saudação da fila — só na primeira vez que o ticket entra numa fila
        if (!current.queue_id) {
            this.automatic.sendQueueGreeting(updated, queueId).catch((err: unknown) =>
                console.error(`[Queue] Falha ao enviar saudação (ticket ${ticketId}, fila ${queueId}):`, err instanceof Error ? err.message : err));
        }
        return updated;
    }

    /** Devolve o ticket para a fila (Aberta 2 → Pendente 1) e zera o atendente. */
    async returnToQueue(ticketId: number, userId: string, companyId: string, profileTag: string): Promise<Ticket> {
        await this.ensureReturnPermission(companyId, profileTag);
        const current = await loadTicket(this.db, ticketId, companyId);
        assertTransition('devolver', current.status_id);

        const updated = await updateIfStatus(this.db, ticketId, companyId, current.status_id, { status_id: 1, attendant_user_id: null, updated_at: new Date() });
        await insertHistory(this.db, ticketId, userId, current.status_id, 1);
        this.events.ticketUpdated(companyId, updated);
        return updated;
    }

    /** Reabre um ticket Fechado (3 → 2), se o contato não tiver outro aberto na mesma conexão. */
    async reopen(ticketId: number, userId: string, companyId: string, profileTag: string): Promise<Ticket> {
        await this.ensureReturnPermission(companyId, profileTag);
        const perms = await this.perms.forCompany(companyId);

        const updated = await this.lock.run(userId, perms.limit_services_users, async (tx) => {
            const current = await loadTicket(tx, ticketId, companyId);
            assertTransition('reabrir', current.status_id);

            const [other] = await tx.select({ id: tickets.id }).from(tickets).where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.contact_id, current.contact_id),
                current.connection_id ? eq(tickets.connection_id, current.connection_id) : isNull(tickets.connection_id),
                inArray(tickets.status_id, [...OPEN_TICKET_STATUSES]),
                isNull(tickets.deleted_at),
                ne(tickets.id, ticketId),
            )).limit(1);
            if (other) throw new TicketAbertoParaContatoError();

            if (!(await new AttendantCapacity(tx).hasCapacity(userId, perms))) {
                throw new AttendantLimitReachedError(perms.number_limit_services_users ?? undefined);
            }
            const reopened = await updateIfStatus(tx, ticketId, companyId, current.status_id, {
                status_id: 2, attendant_user_id: userId, closed_by_user_id: null, updated_at: new Date(),
            });
            await insertHistory(tx, ticketId, userId, current.status_id, 2);
            return reopened;
        });

        this.events.ticketUpdated(companyId, updated);
        return updated;
    }

    /** Transfere o ticket Aberto para outro atendente elegível da fila, com nota interna. */
    async transfer(ticketId: number, fromUserId: string, toUserId: string, companyId: string, queueId: number): Promise<Ticket> {
        if (fromUserId === toUserId) throw new TransferenciaParaSiMesmoError();
        const perms = await this.perms.forCompany(companyId);
        const current = await loadTicket(this.db, ticketId, companyId);
        assertTransition('transferir', current.status_id);

        const eligible = await this.queues.transferTargets(companyId, queueId, current.connection_id ?? 0);
        if (!eligible.some((u) => u.id === toUserId)) throw new AtendenteNaoElegivelError();

        const [fromUser] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, fromUserId)).limit(1);
        const [toUser] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, toUserId)).limit(1);
        if (!toUser) throw new AtendenteDestinoNaoEncontradoError();

        const updated = await this.lock.run(toUserId, perms.limit_services_users, async (tx) => {
            if (!(await new AttendantCapacity(tx).hasCapacity(toUserId, perms))) {
                throw new AttendantLimitReachedError(perms.number_limit_services_users ?? undefined);
            }
            const transferred = await updateIfStatus(tx, ticketId, companyId, current.status_id, {
                attendant_user_id: toUserId, is_transfer: 1, status_id: 2, updated_at: new Date(), queue_id: queueId,
            });
            await insertHistory(tx, ticketId, fromUserId, current.status_id, 2);
            await tx.insert(atendimento_messages).values({
                ticket_id: ticketId,
                body: `Atendimento transferido de *${fromUser?.name ?? 'Atendente anterior'}* para *${toUser.name}*`,
                from_me: true,
                user_id: fromUserId,
            });
            return transferred;
        });

        this.events.ticketUpdated(companyId, updated);
        this.automatic.sendTransfer(updated, fromUser?.name, toUser.name).catch(() => {});
        return updated;
    }
}
