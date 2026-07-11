import { eq, and, ne, inArray, isNull, desc, asc, or, sql, gte, lte, ilike, type SQL } from 'drizzle-orm';
import { db } from '../../database/client';
import { tickets, contacts, historic_tickets, userQueues, Ticket } from './atendimento.db.schema';
import { users } from '../auth/auth.schema';
import { companies } from '../companies/company.db.schema';
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

// Status IDs considerados "ativos" — nova mensagem entra no ticket existente
// 1=Pendente 2=Em Atendimento 7=Pesquisa de Satisfação 9=Bot/Resolvido
const OPEN_STATUSES = [1, 2, 7, 9];

/** O bot só processa mensagens enquanto o ticket está em status Bot (9) — status_id é a única fonte de roteamento. */
export function shouldRunBot(ticket: { status_id: number }): boolean {
    return ticket.status_id === 9;
}

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
        // Filtra pela mesma conexão: um contato pode ter tickets em conexões distintas
        const connCondition = connectionId
            ? eq(tickets.connection_id, connectionId)
            : isNull(tickets.connection_id);

        const [existing] = await db
            .select()
            .from(tickets)
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.contact_id, contactId),
                connCondition,
                inArray(tickets.status_id, OPEN_STATUSES),
                isNull(tickets.deleted_at),
            ))
            .orderBy(desc(tickets.updated_at))
            .limit(1);

        if (existing) return { ticket: existing, created: false };

        // Nenhum ticket aberto: cria um novo. Um contato pode ter vários tickets
        // fechados ao longo do tempo — cada atendimento é um registro definitivo
        // (preserva vendas/ocorrências individuais nos relatórios). O histórico
        // consolidado é resolvido na tela (timeline por contato), não reabrindo
        // o ticket antigo.
        const { botsRepository } = await import('../bots/bots.repository');
        const activeBot = await botsRepository.findDefaultActive(companyId);
        const initialStatusId = activeBot ? 9 : 1;

        const [created] = await db
            .insert(tickets)
            .values({ company_id: companyId, contact_id: contactId, connection_id: connectionId ?? null, serialized_id: serializedId ?? null, origin, status_id: initialStatusId })
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
        queueId?: number;
        /** Restringe a "meus": tickets onde sou atendente OU quem fechou. */
        mineUserId?: string;
        orderBy?: 'ASC' | 'DESC';
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
        if (filters.queueId)            conditions.push(eq(tickets.queue_id, filters.queueId) as any);
        if (filters.mineUserId)         conditions.push(or(
            eq(tickets.attendant_user_id, filters.mineUserId),
            eq(tickets.closed_by_user_id, filters.mineUserId),
        ) as any);
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
            .orderBy(
                desc(sql`${tickets.pinned}`),
                filters.orderBy === 'ASC' ? asc(tickets.updated_at) : desc(tickets.updated_at),
            )
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

    /** Atendente assume o ticket (Pendente=1 ou Bot=9 → Aberto=2). Update atômico condicional. */
    async assignAttendant(ticketId: number, userId: string, companyId: string): Promise<Ticket> {
        const lockKey = `ticket:${ticketId}`;
        if (!acquireLock(lockKey)) throw new Error('Ticket já está sendo assumido por outro atendente');

        try {
            const [current] = await db.select().from(tickets)
                .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
                .limit(1);

            if (!current) throw new Error('Ticket não encontrado');

            // Verifica limite de atendimentos simultâneos por atendente
            const perms = await getCompanyPermissions(companyId);
            if (perms.limit_services_users) {
                const [{ cnt }] = await db
                    .select({ cnt: sql<number>`count(*)::int` })
                    .from(tickets)
                    .where(and(
                        eq(tickets.attendant_user_id, userId),
                        eq(tickets.status_id, 2),
                        isNull(tickets.deleted_at),
                    ));
                if (cnt >= (perms.number_limit_services_users ?? 5)) {
                    throw new Error('Limite de atendimentos simultâneos atingido');
                }
            }

            // Update atômico condicional: só aplica se o ticket ainda estiver
            // Pendente(1) ou em Bot(9) e sem atendente — garante que o bot
            // rodando em paralelo (ou outro atendente) nunca vence uma corrida
            // silenciosamente. Se 0 linhas afetadas, alguém chegou primeiro.
            const [updated] = await db
                .update(tickets)
                .set({ status_id: 2, attendant_user_id: userId, updated_at: new Date() })
                .where(and(
                    eq(tickets.id, ticketId),
                    eq(tickets.company_id, companyId),
                    inArray(tickets.status_id, [1, 9]),
                    isNull(tickets.attendant_user_id),
                ))
                .returning();

            if (!updated) throw new Error('Ticket já foi assumido por outro atendente ou não está mais disponível');

            await db.insert(historic_tickets).values({
                ticket_id: ticketId,
                user_id: userId,
                status_id_init: current.status_id,
                status_id_end: 2,
            });

            emitToCompany(companyId, 'ticket:updated', { ticket: updated });

            // Mensagens automáticas de saudação e protocolo (fire-and-forget)
            this._sendOpeningMessages(updated, userId, companyId, perms).catch(() => {});

            return updated;
        } finally {
            releaseLock(lockKey);
        }
    },

    async _sendOpeningMessages(
        ticket: Ticket,
        userId: string,
        companyId: string,
        perms: Awaited<ReturnType<typeof getCompanyPermissions>>,
    ): Promise<void> {
        if (!ticket.connection_id || !ticket.contact_id) return;

        const [contactRow] = await db
            .select({ number: contacts.number, lid: contacts.lid })
            .from(contacts)
            .where(eq(contacts.id, ticket.contact_id))
            .limit(1);

        const target = contactRow?.number || (contactRow?.lid ? `lid:${contactRow.lid}` : null);
        if (!target) return;

        const [companyRow] = await db
            .select({ init_message: companies.init_message })
            .from(companies)
            .where(eq(companies.id, companyId))
            .limit(1);

        const { whatsappService } = await import('../whatsapp/whatsapp.service');

        if (perms.show_ticket_name_message && companyRow?.init_message) {
            const [attendant] = await db
                .select({ name: users.name })
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

            const msg = companyRow.init_message.replace(
                /\{atendente\}/gi,
                attendant?.name ?? 'nosso atendente',
            );
            await whatsappService.sendTextToPhone(ticket.connection_id, target, msg);
        }

        if (perms.send_ticket_protocol) {
            await whatsappService.sendTextToPhone(
                ticket.connection_id,
                target,
                `O número do protocolo de atendimento é *#${ticket.id}*.`,
            );
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

        // Mensagem de transferência para o cliente (fire-and-forget)
        this._sendTransferMessage(updated, companyId, fromUser?.name, toUser.name).catch(() => {});

        return updated;
    },

    async _sendTransferMessage(
        ticket: Ticket,
        companyId: string,
        fromName: string | undefined,
        toName: string,
    ): Promise<void> {
        if (!ticket.connection_id || !ticket.contact_id) return;

        const perms = await getCompanyPermissions(companyId);
        if (!perms.send_ticket_transfer_msg) return;

        const [companyRow] = await db
            .select({ transfer_message: companies.transfer_message })
            .from(companies)
            .where(eq(companies.id, companyId))
            .limit(1);

        if (!companyRow?.transfer_message) return;

        const [contactRow] = await db
            .select({ number: contacts.number, lid: contacts.lid })
            .from(contacts)
            .where(eq(contacts.id, ticket.contact_id))
            .limit(1);

        const target = contactRow?.number || (contactRow?.lid ? `lid:${contactRow.lid}` : null);
        if (!target) return;

        const msg = companyRow.transfer_message
            .replace(/\{atendente_anterior\}/gi, fromName ?? 'atendente anterior')
            .replace(/\{atendente\}/gi, toName);

        const { whatsappService } = await import('../whatsapp/whatsapp.service');
        await whatsappService.sendTextToPhone(ticket.connection_id, target, msg);
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

        // Mensagem de despedida (fire-and-forget)
        this._sendClosingMessage(updated, companyId).catch(() => {});

        // Pesquisa de satisfação (fire-and-forget)
        const { pesquisaService } = await import('../pesquisas/pesquisa.service');
        pesquisaService.sendSurveyAfterClose(updated).catch((err: Error) =>
            console.error('[Survey] Erro ao enviar pesquisa:', err.message)
        );

        return updated;
    },

    async _sendClosingMessage(ticket: Ticket, companyId: string): Promise<void> {
        if (!ticket.connection_id || !ticket.contact_id) return;

        const perms = await getCompanyPermissions(companyId);
        if (!perms.send_ticket_goodbye_msg) return;

        const [companyRow] = await db
            .select({ end_message: companies.end_message })
            .from(companies)
            .where(eq(companies.id, companyId))
            .limit(1);

        if (!companyRow?.end_message) return;

        const [contactRow] = await db
            .select({ number: contacts.number, lid: contacts.lid })
            .from(contacts)
            .where(eq(contacts.id, ticket.contact_id))
            .limit(1);

        const target = contactRow?.number || (contactRow?.lid ? `lid:${contactRow.lid}` : null);
        if (!target) return;

        const { whatsappService } = await import('../whatsapp/whatsapp.service');
        await whatsappService.sendTextToPhone(ticket.connection_id, target, companyRow.end_message);
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
