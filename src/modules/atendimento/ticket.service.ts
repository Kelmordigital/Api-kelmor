import { eq, and, ne, inArray, isNull, desc, or, sql, gte, lte, ilike, type SQL } from 'drizzle-orm';
import { db } from '../../database/client';
import { tickets, contacts, historic_tickets, userQueues, Ticket } from './atendimento.db.schema';
import { users } from '../auth/auth.schema';
import { emitToCompany } from '../../shared/socket';
import { getCompanyPermissions } from '../configuracao-geral/configuracao-geral.service';

/**
 * Constrói a condição de visibilidade de tickets para um "viewer".
 * - admin/superAdmin ou empresa com show_all_tickets → sem restrição (undefined).
 * - demais: vê ticket cuja fila ele pertence, OU sem fila, OU atribuído a ele.
 *   Se not_show_pending_ticket_without_queue: oculta pendentes (status 1) sem fila.
 */
export async function ticketVisibilityCondition(
    companyId: string,
    userId: string,
    profileTag: string,
): Promise<SQL | undefined> {
    const isAdmin = profileTag === 'admin' || profileTag === 'superAdmin';
    if (isAdmin) return undefined;

    const perms = await getCompanyPermissions(companyId);
    if (perms.show_all_tickets) return undefined;

    const myQueues = await db
        .select({ queue_id: userQueues.queue_id })
        .from(userQueues)
        .where(eq(userQueues.user_id, userId));
    const queueIds = myQueues.map((q) => q.queue_id);

    const ors: SQL[] = [eq(tickets.attendant_user_id, userId)];
    if (queueIds.length) ors.push(inArray(tickets.queue_id, queueIds));
    ors.push(
        perms.not_show_pending_ticket_without_queue
            ? (and(isNull(tickets.queue_id), ne(tickets.status_id, 1)) as SQL)
            : isNull(tickets.queue_id),
    );
    return or(...ors);
}

export interface FunilCard {
    id: number;
    funil_stage: string;
    contact_id: number;
    contact_name: string;
    contact_number: string | null;
    contact_profile_pic_url: string | null;
    status_id: number;
    created_at: Date | null;
}

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
        /** Quando presente, aplica visibilidade por fila para não-admins. */
        viewer?: { userId: string; profileTag: string };
    } = {}): Promise<Ticket[]> {
        const conditions: ReturnType<typeof eq>[] = [
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
        ];

        if (filters.viewer) {
            const vis = await ticketVisibilityCondition(companyId, filters.viewer.userId, filters.viewer.profileTag);
            if (vis) conditions.push(vis as any);
        }

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
        const vis = await ticketVisibilityCondition(companyId, userId, profileTag);

        const rows = await db
            .select({
                status_id: tickets.status_id,
                total: sql<number>`count(*)::int`,
            })
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                isNull(tickets.deleted_at),
                vis,
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

    /**
     * Roteia um ticket para uma fila (usado pelo chatbot). Seta `queue_id` e, se a
     * fila tiver distribuição automática e houver atendente elegível/online, atribui
     * (status 1 → 2). Sem atendente elegível, o ticket fica pendente na fila.
     */
    async routeToQueue(ticketId: number, companyId: string, queueId: number): Promise<Ticket | null> {
        const [current] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);
        if (!current) return null;

        // Já atribuído a um atendente → não mexe (não rouba ticket em atendimento)
        if (current.status_id === 2 && current.attendant_user_id) return current;

        const { distributeTicket } = await import('../filas/queue-distribution.service');
        const chosen = await distributeTicket(companyId, queueId, current.connection_id);

        if (chosen) {
            await db.insert(historic_tickets).values({
                ticket_id: ticketId,
                user_id: chosen,
                status_id_init: current.status_id,
                status_id_end: 2,
            });
        }

        const [updated] = await db
            .update(tickets)
            .set({
                queue_id: queueId,
                ...(chosen ? { status_id: 2, attendant_user_id: chosen } : {}),
                updated_at: new Date(),
            })
            .where(eq(tickets.id, ticketId))
            .returning();

        emitToCompany(companyId, 'ticket:updated', { ticket: updated });
        return updated;
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
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .returning();

        emitToCompany(companyId, 'ticket:closed', { ticketId });

        // Envia pesquisa de satisfação da fila (fire-and-forget)
        const { pesquisaService } = await import('../pesquisas/pesquisa.service');
        pesquisaService.sendSurveyAfterClose(updated).catch((err: Error) =>
            console.error('[Survey] Erro ao enviar pesquisa:', err.message)
        );

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

    // ── Funil Kanban de atendimento ───────────────────────────────────────────

    async createFunilLead(companyId: string, payload: {
        name?: string;
        phone?: string;
        email?: string;
        notes?: string;
        funil_stage?: string;
    }): Promise<FunilCard> {
        const { contactService } = await import('./contact.service');

        let contact;
        if (payload.phone?.trim()) {
            contact = await contactService.findOrCreate(companyId, payload.phone.trim(), payload.name?.trim() || undefined);
            // atualiza nome/email se veio preenchido
            if (payload.name?.trim() || payload.email?.trim()) {
                const [updated] = await db.update(contacts)
                    .set({
                        ...(payload.name?.trim() && { name: payload.name.trim() }),
                        ...(payload.email?.trim() && { email: payload.email.trim() }),
                    })
                    .where(eq(contacts.id, contact.id))
                    .returning();
                contact = updated ?? contact;
            }
        } else {
            const [created] = await db.insert(contacts).values({
                company_id: companyId,
                name: payload.name?.trim() || 'Sem nome',
                email: payload.email?.trim() || null,
                origin: 'funil_manual',
            }).returning();
            contact = created;
        }

        const stage = payload.funil_stage || 'novos_leads';
        const [ticket] = await db.insert(tickets).values({
            company_id: companyId,
            contact_id: contact.id,
            status_id: 1,
            funil_stage: stage,
            origin: 'funil_manual',
            ocurrence: payload.notes?.trim() || null,
        }).returning();

        emitToCompany(companyId, 'ticket:created', { ticket });

        return {
            id: ticket.id,
            funil_stage: stage,
            contact_id: contact.id,
            contact_name: contact.name,
            contact_number: contact.number ?? null,
            contact_profile_pic_url: contact.profile_pic_url ?? null,
            status_id: 1,
            created_at: ticket.created_at,
        };
    },

    async getFunilCards(companyId: string, search?: string): Promise<FunilCard[]> {
        const conditions: ReturnType<typeof eq>[] = [
            eq(tickets.company_id, companyId),
            inArray(tickets.status_id, [1, 2]) as any,
            isNull(tickets.deleted_at),
        ];

        if (search) {
            const term = search.trim();
            const matchIds = await db
                .select({ id: contacts.id })
                .from(contacts)
                .where(and(
                    eq(contacts.company_id, companyId),
                    or(ilike(contacts.name, `%${term}%`), ilike(contacts.number, `%${term}%`)),
                ));
            const ids = matchIds.map((c) => c.id);
            if (ids.length === 0) return [];
            conditions.push(inArray(tickets.contact_id, ids) as any);
        }

        return db
            .select({
                id: tickets.id,
                funil_stage: tickets.funil_stage,
                contact_id: tickets.contact_id,
                contact_name: contacts.name,
                contact_number: contacts.number,
                contact_profile_pic_url: contacts.profile_pic_url,
                status_id: tickets.status_id,
                created_at: tickets.created_at,
            })
            .from(tickets)
            .leftJoin(contacts, eq(tickets.contact_id, contacts.id))
            .where(and(...conditions))
            .orderBy(desc(tickets.created_at)) as Promise<FunilCard[]>;
    },

    async updateFunilStage(ticketId: number, stage: string, companyId: string): Promise<Ticket> {
        const VALID_STAGES = ['novos_leads', 'primeiro_contato', 'agendado', 'atendimento', 'convertido'];
        if (!VALID_STAGES.includes(stage)) throw new Error('Etapa inválida');

        const [updated] = await db
            .update(tickets)
            .set({ funil_stage: stage, updated_at: new Date() })
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .returning();

        if (!updated) throw new Error('Ticket não encontrado');
        emitToCompany(companyId, 'ticket:funil_stage_updated', { ticketId, stage });
        return updated;
    },

    // ── Relatório: status por contato ─────────────────────────────────────────

    async statusByContact(
        companyId: string,
        params: { dateInit?: string; dateEnd?: string; limit?: number; offset?: number },
    ): Promise<{ items: any[]; total: number }> {
        const { dateInit, dateEnd, limit = 50, offset = 0 } = params;

        const conditions: any[] = [
            eq(tickets.company_id, companyId),
            isNull(tickets.deleted_at),
        ];
        if (dateInit) conditions.push(gte(tickets.created_at, new Date(dateInit)));
        if (dateEnd)  conditions.push(lte(tickets.created_at, new Date(dateEnd + 'T23:59:59')));

        const where = and(...conditions);

        const [rows, countRows] = await Promise.all([
            db
                .select({
                    contact_id:     tickets.contact_id,
                    contact_name:   contacts.name,
                    contact_number: contacts.number,
                    open:    sql<number>`cast(count(case when ${tickets.status_id} = 1 then 1 end) as int)`,
                    pending: sql<number>`cast(count(case when ${tickets.status_id} = 2 then 1 end) as int)`,
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
            db
                .select({ count: sql<number>`cast(count(distinct ${tickets.contact_id}) as int)` })
                .from(tickets)
                .where(where),
        ]);

        return { items: rows, total: countRows[0]?.count ?? 0 };
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
