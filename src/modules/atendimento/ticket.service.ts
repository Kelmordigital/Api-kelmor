import { eq, and, inArray, isNull, desc, or, sql, gte, lte, ilike } from 'drizzle-orm';
import { db } from '../../database/client';
import { tickets, contacts, historic_tickets, Ticket } from './atendimento.db.schema';
import { users } from '../auth/auth.schema';
import { emitToCompany } from '../../shared/socket';

// Status IDs
const OPEN_STATUSES = [1, 2];

// In-memory lock simples para evitar race condition no "assumir ticket"
const _locks = new Map<string, boolean>();
function acquireLock(key: string): boolean {
    if (_locks.get(key)) return false;
    _locks.set(key, true);
    setTimeout(() => _locks.delete(key), 8000); // TTL 8s
    return true;
}
function releaseLock(key: string) { _locks.delete(key); }

export const ticketService = {

    // ── Busca / criação ──────────────────────────────────────────────────────

    async findOrCreateOpen(
        companyId: string,
        contactId: number,
        connectionId?: number,
        serializedId?: string,
        origin = 'Base de contatos',
    ): Promise<{ ticket: Ticket; created: boolean }> {
        const [existing] = await db
            .select()
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.contact_id, contactId),
                inArray(tickets.status_id, OPEN_STATUSES),
                isNull(tickets.deleted_at),
            ))
            .orderBy(desc(tickets.updated_at))
            .limit(1);

        if (existing) return { ticket: existing, created: false };

        const [created] = await db
            .insert(tickets)
            .values({ company_id: companyId, contact_id: contactId, connection_id: connectionId ?? null, serialized_id: serializedId ?? null, origin, status_id: 1 })
            .returning();

        emitToCompany(companyId, 'ticket:created', { ticket: created });
        return { ticket: created, created: true };
    },

    async get(ticketId: number, companyId: string): Promise<Ticket | null> {
        const [ticket] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);
        return ticket ?? null;
    },

    // ── Listagem ─────────────────────────────────────────────────────────────

    async list(companyId: string, filters: {
        statusIds?: number[];
        attendantId?: string;
        connectionId?: number;
        search?: string;
        dateInit?: string;
        dateEnd?: string;
        limit?: number;
        offset?: number;
    } = {}): Promise<Ticket[]> {
        const conditions: ReturnType<typeof eq>[] = [
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
        ];

        if (filters.statusIds?.length)  conditions.push(inArray(tickets.status_id, filters.statusIds) as any);
        if (filters.attendantId)        conditions.push(eq(tickets.attendant_user_id, filters.attendantId) as any);
        if (filters.connectionId)       conditions.push(eq(tickets.connection_id, filters.connectionId) as any);
        if (filters.dateInit)           conditions.push(gte(tickets.updated_at, new Date(filters.dateInit)) as any);
        if (filters.dateEnd)            conditions.push(lte(tickets.updated_at, new Date(filters.dateEnd)) as any);

        // Tickets fechados (status 3) sem filtro de data: mostra apenas últimos 3 dias
        const onlyClosedFilter = filters.statusIds?.length === 1 && filters.statusIds[0] === 3;
        if (onlyClosedFilter && !filters.dateInit) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 3);
            conditions.push(gte(tickets.updated_at, cutoff) as any);
        }

        // Busca por nome/número do contato
        if (filters.search) {
            const term = filters.search.trim();
            const matchIds = await db
                .select({ id: contacts.id })
                .from(contacts)
                .where(and(
                    eq(contacts.company_id, companyId),
                    or(
                        ilike(contacts.name,   `%${term}%`),
                        ilike(contacts.number, `%${term}%`),
                    ),
                ));
            const ids = matchIds.map(c => c.id);
            if (ids.length === 0) return [];
            conditions.push(inArray(tickets.contact_id, ids) as any);
        }

        const limit  = filters.limit  ?? 100;
        const offset = filters.offset ?? 0;

        return db
            .select()
            .from(tickets)
            .where(and(...conditions))
            .orderBy(desc(sql`${tickets.pinned}`), desc(tickets.updated_at))
            .limit(limit)
            .offset(offset);
    },

    // ── Contagem por status ───────────────────────────────────────────────────

    async count(companyId: string, userId: string, profileTag: string): Promise<{
        pending: number; open: number; closed: number;
    }> {
        const isAdmin = profileTag === 'admin' || profileTag === 'superAdmin';

        const rows = await db
            .select({
                status_id: tickets.status_id,
                total: sql<number>`count(*)::int`,
            })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                isAdmin ? undefined : or(
                    eq(tickets.status_id, 1),
                    eq(tickets.attendant_user_id, userId),
                ) as any,
            ))
            .groupBy(tickets.status_id);

        const map = new Map(rows.map(r => [Number(r.status_id), r.total]));
        return {
            pending: map.get(1) ?? 0,
            open:    map.get(2) ?? 0,
            closed:  map.get(3) ?? 0,
        };
    },

    // ── Transições de status ──────────────────────────────────────────────────

    /** Atendente assume o ticket (1 → 2). Protegido por lock em memória. */
    async assignAttendant(ticketId: number, userId: string, companyId: string): Promise<Ticket> {
        const lockKey = `ticket:${ticketId}`;
        if (!acquireLock(lockKey)) throw new Error('Ticket já está sendo assumido por outro atendente');

        try {
            const [current] = await db.select().from(tickets)
                .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
                .limit(1);

            if (!current) throw new Error('Ticket não encontrado');
            if (current.status_id === 2 && current.attendant_user_id) {
                throw new Error('Ticket já está em atendimento');
            }

            await db.insert(historic_tickets).values({
                ticket_id: ticketId,
                user_id: userId,
                status_id_init: current.status_id,
                status_id_end: 2,
            });

            const [updated] = await db
                .update(tickets)
                .set({ status_id: 2, attendant_user_id: userId, updated_at: new Date() })
                .where(eq(tickets.id, ticketId))
                .returning();

            emitToCompany(companyId, 'ticket:updated', { ticket: updated });
            return updated;
        } finally {
            releaseLock(lockKey);
        }
    },

    /** Devolve o ticket para a fila (2 → 1). Zera o atendente. */
    async returnToQueue(ticketId: number, userId: string, companyId: string): Promise<Ticket> {
        const [current] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);

        if (!current) throw new Error('Ticket não encontrado');

        await db.insert(historic_tickets).values({
            ticket_id: ticketId,
            user_id: userId,
            status_id_init: current.status_id,
            status_id_end: 1,
        });

        const [updated] = await db
            .update(tickets)
            .set({ status_id: 1, attendant_user_id: null, updated_at: new Date() })
            .where(eq(tickets.id, ticketId))
            .returning();

        emitToCompany(companyId, 'ticket:updated', { ticket: updated });
        return updated;
    },

    /** Reabre um ticket finalizado (3 → 2). Verifica se não há outro aberto para o mesmo contato. */
    async reopen(ticketId: number, userId: string, companyId: string): Promise<Ticket> {
        const [current] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);

        if (!current) throw new Error('Ticket não encontrado');

        // Verifica se já existe outro ticket aberto para o mesmo contato+conexão
        const [alreadyOpen] = await db.select({ id: tickets.id }).from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.contact_id, current.contact_id),
                inArray(tickets.status_id, [1, 2]),
                isNull(tickets.deleted_at),
            ))
            .limit(1);

        if (alreadyOpen) throw new Error('Já existe um ticket aberto para este contato');

        await db.insert(historic_tickets).values({
            ticket_id: ticketId,
            user_id: userId,
            status_id_init: current.status_id,
            status_id_end: 2,
        });

        const [updated] = await db
            .update(tickets)
            .set({ status_id: 2, attendant_user_id: userId, closed_by_user_id: null, updated_at: new Date() })
            .where(eq(tickets.id, ticketId))
            .returning();

        emitToCompany(companyId, 'ticket:updated', { ticket: updated });
        return updated;
    },

    /** Transfere o ticket para outro atendente. Cria mensagem interna de transferência. */
    async transfer(
        ticketId: number,
        fromUserId: string,
        toUserId: string,
        companyId: string,
        queueId?: number,
    ): Promise<Ticket> {
        const [current] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);

        if (!current) throw new Error('Ticket não encontrado');

        const [fromUser] = await db.select({ name: users.name }).from(users).where(eq(users.id, fromUserId)).limit(1);
        const [toUser]   = await db.select({ name: users.name }).from(users).where(eq(users.id, toUserId)).limit(1);

        if (!toUser) throw new Error('Atendente destino não encontrado');

        await db.insert(historic_tickets).values({
            ticket_id: ticketId,
            user_id: fromUserId,
            status_id_init: current.status_id,
            status_id_end: 2,
        });

        const set: Partial<typeof tickets.$inferInsert> = {
            attendant_user_id: toUserId,
            is_transfer: 1,
            status_id: 2,
            updated_at: new Date(),
        };
        if (queueId !== undefined) set.queue_id = queueId;

        const [updated] = await db
            .update(tickets)
            .set(set)
            .where(eq(tickets.id, ticketId))
            .returning();

        const { atendimento_messages } = await import('./atendimento.db.schema');
        const fromName = fromUser?.name ?? 'Atendente anterior';
        await db.insert(atendimento_messages).values({
            ticket_id: ticketId,
            body: `Atendimento transferido de *${fromName}* para *${toUser.name}*`,
            from_me: true,
            user_id: fromUserId,
        });

        emitToCompany(companyId, 'ticket:updated', { ticket: updated });
        return updated;
    },

    /** Alterna fixação do ticket no topo da lista. */
    async togglePin(ticketId: number, companyId: string): Promise<Ticket> {
        const [current] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);

        if (!current) throw new Error('Ticket não encontrado');

        const [updated] = await db
            .update(tickets)
            .set({ pinned: current.pinned ? 0 : 1, updated_at: new Date() })
            .where(eq(tickets.id, ticketId))
            .returning();

        emitToCompany(companyId, 'ticket:updated', { ticket: updated });
        return updated;
    },

    // ── Operações existentes ──────────────────────────────────────────────────

    async closeTicket(
        ticketId: number,
        userId: string,
        companyId: string,
        opts: { ocurrence?: string; service_not_made?: boolean } = {},
    ): Promise<Ticket> {
        const [current] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);

        if (!current) throw new Error('Ticket não encontrado');

        await db.insert(historic_tickets).values({
            ticket_id: ticketId,
            user_id: userId,
            status_id_init: current.status_id,
            status_id_end: 3,
        });

        const [updated] = await db
            .update(tickets)
            .set({
                status_id: 3,
                closed_by_user_id: userId,
                ocurrence: opts.ocurrence ?? null,
                service_not_made: opts.service_not_made ? 1 : 0,
                pinned: 0,
                updated_at: new Date(),
            })
            .where(eq(tickets.id, ticketId))
            .returning();

        emitToCompany(companyId, 'ticket:closed', { ticketId });
        return updated;
    },

    async registerSale(
        ticketId: number,
        companyId: string,
        payload: {
            isSale: boolean;
            saleAmount?: string;
            lossReasonId?: number;
            lossProductName?: string;
        },
    ): Promise<Ticket> {
        const set = payload.isSale
            ? { is_sale: 1, sale_price: payload.saleAmount ?? '0,00', reasons_id: null as number | null, loss_product_name: null as string | null }
            : { is_sale: 0, sale_price: '0,00', reasons_id: payload.lossReasonId ?? null, loss_product_name: payload.lossProductName ?? null };

        const [updated] = await db
            .update(tickets)
            .set({ ...set, updated_at: new Date() })
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .returning();

        if (!updated) throw new Error('Ticket não encontrado');
        return updated;
    },

    /** @deprecated use assignAttendant — mantido para compatibilidade */
    async updateStatus(ticketId: number, statusId: number, companyId: string): Promise<Ticket> {
        const [updated] = await db
            .update(tickets)
            .set({ status_id: statusId, updated_at: new Date() })
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .returning();

        if (!updated) throw new Error('Ticket não encontrado');
        emitToCompany(companyId, 'ticket:updated', { ticket: updated });
        return updated;
    },

    // ── Atendentes da empresa ─────────────────────────────────────────────────

    async listAttendants(companyId: string): Promise<{ id: string; name: string; email: string }[]> {
        return db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(and(eq(users.company_id, companyId), eq(users.is_approved, true)))
            .orderBy(users.name);
    },
};
