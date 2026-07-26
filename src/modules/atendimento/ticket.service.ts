import { eq, and, ne, inArray, isNull, desc, asc, or, sql, gte, lte, ilike, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../database/client';
import { tickets, contacts, historic_tickets, ticket_spy_log, userQueues, userConnections, queues, atendimento_messages, Ticket } from './atendimento.db.schema';
import { users } from '../auth/auth.schema';
import { companies } from '../companies/company.db.schema';
import { emitToCompany } from '../../shared/socket';
import { getCompanyPermissions } from '../configuracao-geral/configuracao-geral.service';
import { filaService } from '../filas/fila.service';
import { attendantHasCapacity, AttendantLimitReachedError } from './attendant-capacity.service';

// XP do mini-game de Conquistas: só quando o próprio fechamento é uma venda
// (ticket.is_sale === 1 no momento em que o fechamento se efetiva). Fechar
// sem venda, ou sem classificar, não soma nada — é um contador real
// (users.xp), não recalculado a partir do histórico de tickets. A quantidade
// por venda é configurável pelo dono (company_permissions.sale_xp_amount).
async function grantSaleXp(userId: string, companyId: string) {
    const perms = await getCompanyPermissions(companyId);
    if (!perms.gamification_enabled) return;
    await db.update(users).set({ xp: sql`${users.xp} + ${perms.sale_xp_amount}` }).where(eq(users.id, userId));
}

export class AtendenteNaoElegivelError extends Error {
    constructor() { super('O atendente selecionado não pertence à fila de destino.'); }
}

export class TransferenciaParaSiMesmoError extends Error {
    constructor() { super('Não é possível transferir o atendimento para o mesmo atendente.'); }
}

export class ReturnTicketPermissionError extends Error {
    constructor() { super('O administrador definiu que você não pode devolver ou reabrir este atendimento.'); }
}

/** admin/superAdmin sempre podem; atendente comum depende de company_permissions.return_ticket. */
async function ensureReturnTicketPermission(companyId: string, profileTag: string): Promise<void> {
    if (profileTag === 'admin' || profileTag === 'superAdmin') return;
    const perms = await getCompanyPermissions(companyId);
    if (!perms.return_ticket) throw new ReturnTicketPermissionError();
}

export class SpyTicketPermissionError extends Error {
    constructor() { super('Você não tem permissão para visualizar este atendimento.'); }
}

/**
 * Gate de visualização de mensagens de um ticket.
 * - status 2 (Aberta) de OUTRO atendente: só o dono ou admin/superAdmin (bypass,
 *   mas ainda entra no log). "Permitir pré-visualização" (spy_ticket) NÃO dá
 *   acesso aqui — não faz sentido "espiar" quem já está atendendo de verdade.
 * - status 1 (Aguardando, sem dono): ler sem aceitar é o próprio conceito de
 *   "espiar" deste sistema — precisa de spy_ticket ligado (admin bypassa).
 * - demais status: sem gate.
 * Toda vez que a checagem passa por causa do bypass/permissão (não é o fluxo
 * normal de dono lendo o próprio ticket), registra em ticket_spy_log.
 */
export async function ensureCanViewTicketMessages(ticket: Ticket, userId: string, profileTag: string): Promise<void> {
    const isAdmin = profileTag === 'admin' || profileTag === 'superAdmin';

    if (ticket.status_id === 2) {
        if (!ticket.attendant_user_id || ticket.attendant_user_id === userId) return;
        if (!isAdmin) throw new SpyTicketPermissionError();
    } else if (ticket.status_id === 1) {
        if (!isAdmin) {
            const perms = await getCompanyPermissions(ticket.company_id);
            if (!perms.spy_ticket) throw new SpyTicketPermissionError();
        }
    } else {
        return;
    }

    await db.insert(ticket_spy_log).values({ company_id: ticket.company_id, ticket_id: ticket.id, user_id: userId });
}

/**
 * "Espiar" só dá direito de LER — nunca de responder. Bloqueia o envio quando
 * o ticket em atendimento (status 2) tem atendente diferente de quem está
 * enviando, admin sempre pode (mesmo bypass usado no resto do sistema).
 */
export function ensureCanSendToTicket(ticket: Ticket, userId: string, profileTag: string): void {
    if (ticket.status_id !== 2) return;
    if (!ticket.attendant_user_id || ticket.attendant_user_id === userId) return;
    if (profileTag === 'admin' || profileTag === 'superAdmin') return;
    throw new SpyTicketPermissionError();
}

/**
 * Constrói a condição de visibilidade de tickets para um "viewer".
 * - admin/superAdmin ou empresa com show_all_tickets → sem restrição (undefined).
 * - demais, o atendente vê o ticket se qualquer uma valer:
 *     (a) está atribuído a ele; OU
 *     (b) está numa fila dele E numa conexão dele (ou sem conexão atribuída) —
 *         isolamento por conexão: atendimentos de um número que não é dele não
 *         aparecem, mesmo que caiam numa fila em comum; OU
 *     (c) não tem fila (queue_id nulo) — permanece visível a todos os atendentes.
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

    const [myQueues, myConns] = await Promise.all([
        db.select({ queue_id: userQueues.queue_id }).from(userQueues).where(eq(userQueues.user_id, userId)),
        db.select({ connection_id: userConnections.connection_id }).from(userConnections).where(eq(userConnections.user_id, userId)),
    ]);
    const queueIds = myQueues.map((q) => q.queue_id);
    const connIds = myConns.map((c) => c.connection_id);

    const ors: SQL[] = [eq(tickets.attendant_user_id, userId)];
    if (queueIds.length) {
        // Ticket com fila só é visível se também for de uma conexão do atendente
        // (ou sem conexão atribuída — ticket "solto" não é da Conexão B).
        const connScope = connIds.length
            ? (or(inArray(tickets.connection_id, connIds), isNull(tickets.connection_id)) as SQL)
            : (isNull(tickets.connection_id) as SQL);
        ors.push(and(inArray(tickets.queue_id, queueIds), connScope) as SQL);
    }
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

/** Data/hora atual no fuso de São Paulo, formato DD/MM/AAAA HH:mm:ss (placeholder {hora}). */
function formatHoraBR(date: Date): string {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Substitui os placeholders {atendente}/{ticket}/{hora} (case-insensitive) numa mensagem automática. */
function fillMessageTemplate(template: string, vars: { atendente?: string; ticketId: number }): string {
    return template
        .replace(/\{atendente\}/gi, vars.atendente ?? 'atendente')
        .replace(/\{ticket\}/gi, String(vars.ticketId))
        .replace(/\{hora\}/gi, formatHoraBR(new Date()));
}

export const ticketService = {

    // ── Busca / criação ──────────────────────────────────────────────────────

    /** Busca o ticket aberto do contato (mesma conexão), sem criar um novo. */
    async findOpenTicket(companyId: string, contactId: number, connectionId?: number): Promise<Ticket | null> {
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

        return existing ?? null;
    },

    async findOrCreateOpen(
        companyId: string,
        contactId: number,
        connectionId?: number,
        serializedId?: string,
        origin = 'Base de contatos',
    ): Promise<{ ticket: Ticket; created: boolean }> {
        const existing = await this.findOpenTicket(companyId, contactId, connectionId);
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

        // Sem bot ativo: se a conexão tiver exatamente 1 fila ativa vinculada,
        // o ticket já nasce roteado pra ela (mesma lógica do nó "Transferir" do bot).
        if (!activeBot && connectionId) {
            const activeQueues = await filaService.findActiveQueuesByConnection(connectionId);
            if (activeQueues.length === 1) {
                const routed = await this.routeToQueue(created.id, companyId, activeQueues[0].id);
                if (routed) return { ticket: routed, created: true };
            }
        }

        return { ticket: created, created: true };
    },

    /**
     * Vincula uma mensagem enviada por FORA do atendimento humano (hoje: API
     * transacional) ao histórico de conversa do contato. Reaproveita um ticket
     * já aberto na mesma conexão (mesma regra de `findOpenTicket`, único ponto
     * de decisão "isso ainda conta como conversa em aberto?" — não duplicar
     * essa pergunta em cada canal de envio automatizado). Sem ticket aberto,
     * cria um novo já FECHADO e sem atendente — só pra guardar o histórico,
     * nunca entra em fila/bot, nunca aparece pra alguém aceitar.
     */
    async attachExternalMessage(
        companyId: string,
        contactId: number,
        connectionId: number,
        body: string,
    ): Promise<Ticket> {
        const existing = await this.findOpenTicket(companyId, contactId, connectionId);

        let ticket = existing;
        if (!ticket) {
            const [created] = await db.insert(tickets).values({
                company_id: companyId,
                contact_id: contactId,
                connection_id: connectionId,
                status_id: 3,
                origin: 'API',
            }).returning();
            ticket = created;
            emitToCompany(companyId, 'ticket:created', { ticket });
        }

        const { messageService } = await import('./message.service');
        await messageService.save(ticket.id, contactId, body, true, companyId, {});

        return ticket;
    },

    async get(ticketId: number, companyId: string): Promise<Ticket | null> {
        const [ticket] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);
        return ticket ?? null;
    },

    /**
     * Histórico de atendimentos de um contato — todos os tickets (aberto e
     * fechados) para montar a timeline consolidada na tela de chat, sem
     * precisar reabrir/reaproveitar o ticket antigo (cada um continua sendo
     * um registro definitivo, preservando venda/ocorrência individuais).
     */
    async listByContact(contactId: number, companyId: string): Promise<Array<Ticket & {
        attendant_name: string | null;
        closed_by_name: string | null;
    }>> {
        const attendantUser = alias(users, 'attendant_user');
        const closerUser = alias(users, 'closer_user');

        const rows = await db
            .select({
                ticket: tickets,
                attendant_name: attendantUser.name,
                closed_by_name: closerUser.name,
            })
            .from(tickets)
            .leftJoin(attendantUser, eq(attendantUser.id, tickets.attendant_user_id))
            .leftJoin(closerUser, eq(closerUser.id, tickets.closed_by_user_id))
            .where(and(
                eq(tickets.company_id, companyId),
                eq(tickets.contact_id, contactId),
                isNull(tickets.deleted_at),
            ))
            .orderBy(desc(tickets.created_at));

        return rows.map(r => ({ ...r.ticket, attendant_name: r.attendant_name, closed_by_name: r.closed_by_name }));
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

        const perms = await getCompanyPermissions(companyId);

        // Serializa por atendente (não só por ticket): sem isso, dois aceites
        // simultâneos de tickets DIFERENTES pelo mesmo atendente passariam na
        // contagem do limite antes que qualquer um dos dois efetivasse — cada
        // um vendo a contagem sem o outro ainda computado.
        const attendantLockKey = `attendant-limit:${userId}`;
        const attendantLocked = !perms.limit_services_users || acquireLock(attendantLockKey);
        if (!attendantLocked) {
            releaseLock(lockKey);
            throw new Error('Outro atendimento está sendo processado para este atendente, tente novamente em instantes');
        }

        try {
            const [current] = await db.select().from(tickets)
                .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
                .limit(1);

            if (!current) throw new Error('Ticket não encontrado');

            if (!(await attendantHasCapacity(userId, perms))) {
                throw new AttendantLimitReachedError(perms.number_limit_services_users ?? undefined);
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
            if (perms.limit_services_users) releaseLock(attendantLockKey);
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
            // Dedup: evita repetir a mensagem de abertura pro mesmo contato em
            // sequência rápida (ex.: reabrir/reatribuir várias vezes seguidas).
            const intervalHours = perms.interval_between_init_message ?? 1;
            const cutoff = new Date(Date.now() - intervalHours * 3600 * 1000);
            const [recent] = await db
                .select({ id: atendimento_messages.id })
                .from(atendimento_messages)
                .where(and(
                    eq(atendimento_messages.contact_id, ticket.contact_id),
                    eq(atendimento_messages.media_type, 'auto_init'),
                    gte(atendimento_messages.created_at, cutoff),
                ))
                .limit(1);

            if (!recent) {
                const [attendant] = await db
                    .select({ name: users.name })
                    .from(users)
                    .where(eq(users.id, userId))
                    .limit(1);

                const msg = fillMessageTemplate(companyRow.init_message, { atendente: attendant?.name ?? 'nosso atendente', ticketId: ticket.id });
                const { messageService } = await import('./message.service');
                await messageService.save(ticket.id, ticket.contact_id, msg, true, companyId, { userId, mediaType: 'auto_init' });
                await whatsappService.sendTextToPhone(ticket.connection_id, target, msg);
            }
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

        // Saudação da fila — só na primeira vez que o ticket entra numa fila
        // (transferência manual entre filas não reenvia, só a nota interna).
        if (!current.queue_id) {
            this._sendQueueGreeting(updated, queueId).catch((err: unknown) =>
                console.error(
                    `[Queue] Falha ao enviar saudação (ticket ${ticketId}, fila ${queueId}):`,
                    err instanceof Error ? err.message : err,
                ),
            );
        }

        return updated;
    },

    async _sendQueueGreeting(ticket: Ticket, queueId: number): Promise<void> {
        if (!ticket.connection_id || !ticket.contact_id) return;

        const [queueRow] = await db
            .select({ greeting_message: queues.greeting_message })
            .from(queues)
            .where(eq(queues.id, queueId))
            .limit(1);
        if (!queueRow?.greeting_message) return;

        const [contactRow] = await db
            .select({ number: contacts.number, lid: contacts.lid })
            .from(contacts)
            .where(eq(contacts.id, ticket.contact_id))
            .limit(1);

        const target = contactRow?.number || (contactRow?.lid ? `lid:${contactRow.lid}` : null);
        if (!target) return;

        const { messageService } = await import('./message.service');
        const { whatsappService } = await import('../whatsapp/whatsapp.service');

        await messageService.save(ticket.id, ticket.contact_id, queueRow.greeting_message, true, ticket.company_id, { mediaType: 'auto_queue_greeting' });
        await whatsappService.sendTextToPhone(ticket.connection_id, target, queueRow.greeting_message);
    },

    /** Devolve o ticket para a fila (2 → 1). Zera o atendente. */
    async returnToQueue(ticketId: number, userId: string, companyId: string, profileTag: string): Promise<Ticket> {
        await ensureReturnTicketPermission(companyId, profileTag);

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
    async reopen(ticketId: number, userId: string, companyId: string, profileTag: string): Promise<Ticket> {
        await ensureReturnTicketPermission(companyId, profileTag);

        const perms = await getCompanyPermissions(companyId);
        const attendantLockKey = `attendant-limit:${userId}`;
        const attendantLocked = !perms.limit_services_users || acquireLock(attendantLockKey);
        if (!attendantLocked) {
            throw new Error('Outro atendimento está sendo processado para este atendente, tente novamente em instantes');
        }

        try {
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

            if (!(await attendantHasCapacity(userId, perms))) {
                throw new AttendantLimitReachedError(perms.number_limit_services_users ?? undefined);
            }

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
        } finally {
            if (perms.limit_services_users) releaseLock(attendantLockKey);
        }
    },

    /** Transfere o ticket para outro atendente dentro de uma fila. Cria mensagem interna de transferência. */
    async transfer(
        ticketId: number,
        fromUserId: string,
        toUserId: string,
        companyId: string,
        queueId: number,
    ): Promise<Ticket> {
        if (fromUserId === toUserId) throw new TransferenciaParaSiMesmoError();

        const perms = await getCompanyPermissions(companyId);
        const attendantLockKey = `attendant-limit:${toUserId}`;
        const attendantLocked = !perms.limit_services_users || acquireLock(attendantLockKey);
        if (!attendantLocked) {
            throw new Error('Outro atendimento está sendo processado para este atendente, tente novamente em instantes');
        }

        try {
            const [current] = await db.select().from(tickets)
                .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
                .limit(1);

            if (!current) throw new Error('Ticket não encontrado');

            const eligible = await filaService.eligibleUsers(companyId, queueId, current.connection_id ?? 0);
            if (!eligible.some((u) => u.id === toUserId)) throw new AtendenteNaoElegivelError();

            if (!(await attendantHasCapacity(toUserId, perms))) {
                throw new AttendantLimitReachedError(perms.number_limit_services_users ?? undefined);
            }

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
                queue_id: queueId,
            };

            const [updated] = await db
                .update(tickets)
                .set(set)
                .where(eq(tickets.id, ticketId))
                .returning();

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
        } finally {
            if (perms.limit_services_users) releaseLock(attendantLockKey);
        }
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
        opts: { ocurrence?: string; service_not_made?: boolean; sendGoodbye?: boolean } = {},
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

        if (current.is_sale === 1) await grantSaleXp(userId, companyId);

        emitToCompany(companyId, 'ticket:closed', { ticketId });

        // Mensagem de despedida (fire-and-forget). Se o fechamento manual informou
        // a escolha (com/sem mensagem), ela sobrepõe a permissão global. Erro no envio
        // (ex.: conexão do WhatsApp caída) não impede o fechamento, mas é logado —
        // antes era engolido em silêncio, escondendo desconexões do bays.
        this._sendClosingMessage(updated, companyId, opts.sendGoodbye, userId).catch((err: unknown) =>
            console.error(
                `[Close] Falha ao enviar mensagem de despedida (ticket ${ticketId}):`,
                err instanceof Error ? err.message : err,
            ),
        );

        return updated;
    },

    /**
     * Fechamento alternativo: em vez de despedida, pergunta a pesquisa de
     * satisfação. O ticket NÃO fecha ainda — vai para status 7 (Realizando
     * Pesquisa) e só vira Fechado (3) de fato quando o cliente responder
     * (ver pesquisaService.tryRecordAnswer → finalizeAfterResearch). É uma
     * alternativa exclusiva à despedida, nunca as duas juntas.
     */
    async closeTicketWithResearch(ticketId: number, userId: string, companyId: string): Promise<Ticket> {
        const [current] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);
        if (!current) throw new Error('Ticket não encontrado');

        const { pesquisaService } = await import('../pesquisas/pesquisa.service');
        const research = await pesquisaService.findActiveForQueue(current.queue_id, companyId);
        if (!research) throw new Error('Nenhuma pesquisa de satisfação configurada para este atendimento');

        await db.insert(historic_tickets).values({
            ticket_id: ticketId,
            user_id: userId,
            status_id_init: current.status_id,
            status_id_end: 7,
        });

        const [updated] = await db
            .update(tickets)
            .set({ status_id: 7, closed_by_user_id: userId, pinned: 0, updated_at: new Date() })
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .returning();

        emitToCompany(companyId, 'ticket:updated', { ticket: updated });

        await pesquisaService.sendSurveyQuestion(updated, research);

        return updated;
    },

    /** Fecha de fato o ticket depois que a pesquisa de satisfação foi respondida (status 7 → 3). */
    async finalizeAfterResearch(ticketId: number, companyId: string): Promise<void> {
        const [current] = await db.select().from(tickets)
            .where(and(eq(tickets.id, ticketId), eq(tickets.company_id, companyId)))
            .limit(1);
        if (!current || current.status_id !== 7) return;

        await db.insert(historic_tickets).values({
            ticket_id: ticketId,
            user_id: current.closed_by_user_id,
            status_id_init: 7,
            status_id_end: 3,
        });

        await db
            .update(tickets)
            .set({ status_id: 3, updated_at: new Date() })
            .where(eq(tickets.id, ticketId));

        if (current.is_sale === 1 && current.closed_by_user_id) await grantSaleXp(current.closed_by_user_id, companyId);

        emitToCompany(companyId, 'ticket:closed', { ticketId });
    },

    /**
     * Envia a mensagem de despedida ao fechar o ticket.
     *
     * @param sendGoodbye  Escolha explícita do fechamento manual:
     *   - true      → envia, ignorando a permissão global
     *   - false     → não envia
     *   - undefined → comportamento automático (respeita send_ticket_goodbye_msg)
     */
    async _sendClosingMessage(ticket: Ticket, companyId: string, sendGoodbye: boolean | undefined, userId: string): Promise<void> {
        if (!ticket.contact_id) return;
        if (sendGoodbye === false) return;

        const perms = await getCompanyPermissions(companyId);
        if (sendGoodbye === undefined && !perms.send_ticket_goodbye_msg) return;

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

        if (!ticket.connection_id) {
            console.warn(`[_sendClosingMessage] Sem connection_id para ticket ${ticket.id} (contact: ${target}). Mensagem não será enviada.`);
            return;
        }

        // Dedup: evita reenviar despedida pro mesmo contato em sequência rápida
        // (ex.: fecha e reabre vários tickets seguidos em pouco tempo).
        const intervalHours = perms.interval_between_ended_message ?? 6;
        const cutoff = new Date(Date.now() - intervalHours * 3600 * 1000);
        const [recent] = await db
            .select({ id: atendimento_messages.id })
            .from(atendimento_messages)
            .where(and(
                eq(atendimento_messages.contact_id, ticket.contact_id),
                eq(atendimento_messages.media_type, 'auto_goodbye'),
                gte(atendimento_messages.created_at, cutoff),
            ))
            .limit(1);
        if (recent) return;

        const [closer] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
        const text = fillMessageTemplate(companyRow.end_message, { atendente: closer?.name ?? 'atendente', ticketId: ticket.id });

        const { messageService } = await import('./message.service');
        const { whatsappService } = await import('../whatsapp/whatsapp.service');

        await messageService.save(
            ticket.id,
            ticket.contact_id,
            text,
            true,
            companyId,
            { userId, mediaType: 'auto_goodbye' },
        );

        await whatsappService.sendTextToPhone(ticket.connection_id, target, text);
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
