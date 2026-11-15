import { eq, and, ne, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../../../core/database/executor';
import type { CompanyPermissionsReader } from '../../configuracao-geral/configuracao-geral.service';
import { tickets, ticket_spy_log, userQueues, userConnections, type Ticket } from '../atendimento.db.schema';
import { SpyTicketPermissionError } from '../atendimento.errors';

export const isAdminTag = (profileTag: string) => profileTag === 'admin' || profileTag === 'superAdmin';

/** Quem vê, espia e responde cada ticket. */
export class TicketAccessPolicy {
    constructor(private readonly db: DbExecutor, private readonly perms: CompanyPermissionsReader) {}

    /**
     * Condição de visibilidade de tickets para um "viewer".
     * - admin/superAdmin ou empresa com show_all_tickets → sem restrição (undefined).
     * - demais: atribuído a ele; OU numa fila dele E numa conexão dele (ou sem conexão);
     *   OU sem fila (oculta pendentes sem fila se not_show_pending_ticket_without_queue).
     */
    async visibilityCondition(companyId: string, userId: string, profileTag: string): Promise<SQL | undefined> {
        if (isAdminTag(profileTag)) return undefined;
        const perms = await this.perms.forCompany(companyId);
        if (perms.show_all_tickets) return undefined;

        const [myQueues, myConns] = await Promise.all([
            this.db.select({ queue_id: userQueues.queue_id }).from(userQueues).where(eq(userQueues.user_id, userId)),
            this.db.select({ connection_id: userConnections.connection_id }).from(userConnections).where(eq(userConnections.user_id, userId)),
        ]);
        const queueIds = myQueues.map((q) => q.queue_id);
        const connIds = myConns.map((c) => c.connection_id);

        const ors: SQL[] = [eq(tickets.attendant_user_id, userId)];
        if (queueIds.length) {
            const connScope = connIds.length
                ? (or(inArray(tickets.connection_id, connIds), isNull(tickets.connection_id)) as SQL)
                : (isNull(tickets.connection_id) as SQL);
            ors.push(and(inArray(tickets.queue_id, queueIds), connScope) as SQL);
        }
        ors.push(perms.not_show_pending_ticket_without_queue
            ? (and(isNull(tickets.queue_id), ne(tickets.status_id, 1)) as SQL)
            : isNull(tickets.queue_id));
        return or(...ors);
    }

    /**
     * Gate de leitura das mensagens:
     * - Aberta (2) de OUTRO atendente: só admin (registra no log);
     * - Pendente (1): ler sem aceitar = "espiar", exige spy_ticket (admin bypassa; registra);
     * - demais status: livre.
     */
    async ensureCanViewMessages(ticket: Ticket, userId: string, profileTag: string): Promise<void> {
        const isAdmin = isAdminTag(profileTag);
        if (ticket.status_id === 2) {
            if (!ticket.attendant_user_id || ticket.attendant_user_id === userId) return;
            if (!isAdmin) throw new SpyTicketPermissionError();
        } else if (ticket.status_id === 1) {
            if (!isAdmin && !(await this.perms.forCompany(ticket.company_id)).spy_ticket) throw new SpyTicketPermissionError();
        } else {
            return;
        }
        await this.db.insert(ticket_spy_log).values({ company_id: ticket.company_id, ticket_id: ticket.id, user_id: userId });
    }

    /** "Espiar" só dá direito de LER: em ticket Aberta de outro atendente, só admin envia. */
    ensureCanSend(ticket: Ticket, userId: string, profileTag: string): void {
        if (ticket.status_id !== 2) return;
        if (!ticket.attendant_user_id || ticket.attendant_user_id === userId) return;
        if (isAdminTag(profileTag)) return;
        throw new SpyTicketPermissionError();
    }
}
