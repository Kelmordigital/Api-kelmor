import { eq, and, inArray, isNull, desc, asc, or, sql, gte, lte, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../../../core/database/executor';
import { users } from '../../auth/auth.schema';
import { profiles } from '../../profiles/profile.db.schema';
import { tickets, contacts, type Ticket } from '../atendimento.db.schema';
import type { AtendimentoEvents } from '../atendimento.ports';
import { TicketNaoEncontradoError } from '../atendimento.errors';
import type { TicketAccessPolicy } from './ticket-access';
import type { ContactReportService } from '../contatos/contact-report.service';

export interface TicketListFilters {
    statusIds?: number[];
    attendantId?: string;
    connectionId?: number;
    queueId?: number;
    /** Restringe a "meus": tickets onde sou atendente OU quem fechou. */
    mineUserId?: string;
    orderBy?: 'ASC' | 'DESC';
    search?: string;
    dateInit?: string;
    dateEnd?: string;
    limit?: number;
    offset?: number;
    /** Quando presente, aplica a visibilidade por fila/conexão para não-admins. */
    viewer?: { userId: string; profileTag: string };
}

/** Caixa de entrada: busca, listagem, contagem por status, fixar, histórico do contato. */
export class TicketInboxService {
    constructor(
        private readonly db: DbExecutor,
        private readonly access: TicketAccessPolicy,
        private readonly contactSearch: Pick<ContactReportService, 'idsMatching'>,
        private readonly events: AtendimentoEvents,
    ) {}

    async get(ticketId: number, companyId: string): Promise<Ticket | null> {
        const [ticket] = await this.db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId))).limit(1);
        return ticket ?? null;
    }

    async getOrFail(ticketId: number, companyId: string): Promise<Ticket> {
        const ticket = await this.get(ticketId, companyId);
        if (!ticket) throw new TicketNaoEncontradoError();
        return ticket;
    }

    /** Histórico de atendimentos do contato (timeline na tela do chat, sem reabrir tickets antigos). */
    async listByContact(contactId: number, companyId: string): Promise<Array<Ticket & { attendant_name: string | null; closed_by_name: string | null }>> {
        const attendantUser = alias(users, 'attendant_user');
        const closerUser = alias(users, 'closer_user');
        const rows = await this.db
            .select({ ticket: tickets, attendant_name: attendantUser.name, closed_by_name: closerUser.name })
            .from(tickets)
            .leftJoin(attendantUser, eq(attendantUser.id, tickets.attendant_user_id))
            .leftJoin(closerUser, eq(closerUser.id, tickets.closed_by_user_id))
            .where(and(eq(tickets.company_id, companyId), eq(tickets.contact_id, contactId), isNull(tickets.deleted_at)))
            .orderBy(desc(tickets.created_at));
        return rows.map((r) => ({ ...r.ticket, attendant_name: r.attendant_name, closed_by_name: r.closed_by_name }));
    }

    async list(companyId: string, filters: TicketListFilters = {}): Promise<Ticket[]> {
        const conditions: SQL[] = [eq(tickets.company_id, companyId), isNull(tickets.deleted_at) as SQL];

        if (filters.viewer) {
            const vis = await this.access.visibilityCondition(companyId, filters.viewer.userId, filters.viewer.profileTag);
            if (vis) conditions.push(vis);
        }
        if (filters.statusIds?.length) conditions.push(inArray(tickets.status_id, filters.statusIds));
        if (filters.attendantId)       conditions.push(eq(tickets.attendant_user_id, filters.attendantId));
        if (filters.connectionId)      conditions.push(eq(tickets.connection_id, filters.connectionId));
        if (filters.queueId)           conditions.push(eq(tickets.queue_id, filters.queueId));
        if (filters.mineUserId)        conditions.push(or(eq(tickets.attendant_user_id, filters.mineUserId), eq(tickets.closed_by_user_id, filters.mineUserId)) as SQL);
        if (filters.dateInit)          conditions.push(gte(tickets.updated_at, new Date(filters.dateInit)));
        if (filters.dateEnd)           conditions.push(lte(tickets.updated_at, new Date(filters.dateEnd)));

        // Só fechados (status 3) sem filtro de data: últimos 3 dias
        if (filters.statusIds?.length === 1 && filters.statusIds[0] === 3 && !filters.dateInit) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 3);
            conditions.push(gte(tickets.updated_at, cutoff));
        }

        if (filters.search) {
            const ids = await this.contactSearch.idsMatching(companyId, filters.search.trim());
            if (ids.length === 0) return [];
            conditions.push(inArray(tickets.contact_id, ids));
        }

        return this.db.select().from(tickets).where(and(...conditions))
            .orderBy(desc(sql`${tickets.pinned}`), filters.orderBy === 'ASC' ? asc(tickets.updated_at) : desc(tickets.updated_at))
            .limit(filters.limit ?? 100)
            .offset(filters.offset ?? 0);
    }

    async count(companyId: string, userId: string, profileTag: string): Promise<{ pending: number; open: number; closed: number }> {
        const vis = await this.access.visibilityCondition(companyId, userId, profileTag);
        const rows = await this.db.select({ status_id: tickets.status_id, total: sql<number>`count(*)::int` })
            .from(tickets)
            .where(and(eq(tickets.company_id, companyId), isNull(tickets.deleted_at), vis))
            .groupBy(tickets.status_id);
        const map = new Map(rows.map((r) => [Number(r.status_id), r.total]));
        return { pending: map.get(1) ?? 0, open: map.get(2) ?? 0, closed: map.get(3) ?? 0 };
    }

    /** Alterna a fixação do ticket no topo da lista. */
    async togglePin(ticketId: number, companyId: string): Promise<Ticket> {
        const current = await this.getOrFail(ticketId, companyId);
        const [updated] = await this.db.update(tickets)
            .set({ pinned: current.pinned ? 0 : 1, updated_at: new Date() })
            .where(eq(tickets.id, ticketId)).returning();
        this.events.ticketUpdated(companyId, updated);
        return updated;
    }

    /** Relatório "Status por contato": pending = Pendente (1), open = Aberta (2), closed = Fechada (3). */
    async statusByContact(companyId: string, params: { dateInit?: string; dateEnd?: string; limit?: number; offset?: number }): Promise<{ items: any[]; total: number }> {
        const { dateInit, dateEnd, limit = 50, offset = 0 } = params;
        const conditions: SQL[] = [eq(tickets.company_id, companyId), isNull(tickets.deleted_at) as SQL];
        if (dateInit) conditions.push(gte(tickets.created_at, new Date(dateInit)));
        if (dateEnd)  conditions.push(lte(tickets.created_at, new Date(dateEnd + 'T23:59:59')));
        const where = and(...conditions);

        const [rows, countRows] = await Promise.all([
            this.db.select({
                contact_id:     tickets.contact_id,
                contact_name:   contacts.name,
                contact_number: contacts.number,
                open:    sql<number>`cast(count(case when ${tickets.status_id} = 2 then 1 end) as int)`,
                pending: sql<number>`cast(count(case when ${tickets.status_id} = 1 then 1 end) as int)`,
                closed:  sql<number>`cast(count(case when ${tickets.status_id} = 3 then 1 end) as int)`,
                total:   sql<number>`cast(count(*) as int)`,
            })
                .from(tickets)
                .innerJoin(contacts, eq(contacts.id, tickets.contact_id))
                .where(where)
                .groupBy(tickets.contact_id, contacts.name, contacts.number)
                .orderBy(desc(sql`count(*)`))
                .limit(limit)
                .offset(offset),
            this.db.select({ count: sql<number>`cast(count(distinct ${tickets.contact_id}) as int)` }).from(tickets).where(where),
        ]);
        return { items: rows, total: countRows[0]?.count ?? 0 };
    }

    /** Atendentes aprovados da empresa (lista de transferência). */
    listAttendants(companyId: string): Promise<{ id: string; name: string; email: string; profile_tag: string }[]> {
        return this.db.select({ id: users.id, name: users.name, email: users.email, profile_tag: profiles.tag })
            .from(users)
            .innerJoin(profiles, eq(users.profile_id, profiles.id))
            .where(and(eq(users.company_id, companyId), eq(users.is_approved, true)))
            .orderBy(users.name);
    }
}
