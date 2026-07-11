"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketService = void 0;
exports.ticketVisibilityCondition = ticketVisibilityCondition;
exports.shouldRunBot = shouldRunBot;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("./atendimento.db.schema");
const auth_schema_1 = require("../auth/auth.schema");
const company_db_schema_1 = require("../companies/company.db.schema");
const socket_1 = require("../../shared/socket");
const configuracao_geral_service_1 = require("../configuracao-geral/configuracao-geral.service");
/**
 * Constrói a condição de visibilidade de tickets para um "viewer".
 * - admin/superAdmin ou empresa com show_all_tickets → sem restrição (undefined).
 * - demais: vê ticket cuja fila ele pertence, OU sem fila, OU atribuído a ele.
 *   Se not_show_pending_ticket_without_queue: oculta pendentes (status 1) sem fila.
 */
async function ticketVisibilityCondition(companyId, userId, profileTag) {
    const isAdmin = profileTag === 'admin' || profileTag === 'superAdmin';
    if (isAdmin)
        return undefined;
    const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
    if (perms.show_all_tickets)
        return undefined;
    const myQueues = await client_1.db
        .select({ queue_id: atendimento_db_schema_1.userQueues.queue_id })
        .from(atendimento_db_schema_1.userQueues)
        .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, userId));
    const queueIds = myQueues.map((q) => q.queue_id);
    const ors = [(0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, userId)];
    if (queueIds.length)
        ors.push((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.queue_id, queueIds));
    ors.push(perms.not_show_pending_ticket_without_queue
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.queue_id), (0, drizzle_orm_1.ne)(atendimento_db_schema_1.tickets.status_id, 1))
        : (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.queue_id));
    return (0, drizzle_orm_1.or)(...ors);
}
// Status IDs considerados "ativos" — nova mensagem entra no ticket existente
// 1=Pendente 2=Em Atendimento 7=Pesquisa de Satisfação 9=Bot/Resolvido
const OPEN_STATUSES = [1, 2, 7, 9];
/** O bot só processa mensagens enquanto o ticket está em status Bot (9) — status_id é a única fonte de roteamento. */
function shouldRunBot(ticket) {
    return ticket.status_id === 9;
}
// In-memory lock simples para evitar race condition no "assumir ticket"
const _locks = new Map();
function acquireLock(key) {
    if (_locks.get(key))
        return false;
    _locks.set(key, true);
    setTimeout(() => _locks.delete(key), 8000); // TTL 8s
    return true;
}
function releaseLock(key) { _locks.delete(key); }
/** Data/hora atual no fuso de São Paulo, formato DD/MM/AAAA HH:mm:ss (placeholder {hora}). */
function formatHoraBR(date) {
    const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const get = (t) => parts.find(p => p.type === t)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
}
/** Substitui os placeholders {atendente}/{ticket}/{hora} (case-insensitive) numa mensagem automática. */
function fillMessageTemplate(template, vars) {
    return template
        .replace(/\{atendente\}/gi, vars.atendente ?? 'atendente')
        .replace(/\{ticket\}/gi, String(vars.ticketId))
        .replace(/\{hora\}/gi, formatHoraBR(new Date()));
}
exports.ticketService = {
    // ── Busca / criação ──────────────────────────────────────────────────────
    async findOrCreateOpen(companyId, contactId, connectionId, serializedId, origin = 'Base de contatos') {
        // Filtra pela mesma conexão: um contato pode ter tickets em conexões distintas
        const connCondition = connectionId
            ? (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.connection_id, connectionId)
            : (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.connection_id);
        const [existing] = await client_1.db
            .select()
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, contactId), connCondition, (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.status_id, OPEN_STATUSES), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at)))
            .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.updated_at))
            .limit(1);
        if (existing)
            return { ticket: existing, created: false };
        // Nenhum ticket aberto: cria um novo. Um contato pode ter vários tickets
        // fechados ao longo do tempo — cada atendimento é um registro definitivo
        // (preserva vendas/ocorrências individuais nos relatórios). O histórico
        // consolidado é resolvido na tela (timeline por contato), não reabrindo
        // o ticket antigo.
        const { botsRepository } = await Promise.resolve().then(() => __importStar(require('../bots/bots.repository')));
        const activeBot = await botsRepository.findDefaultActive(companyId);
        const initialStatusId = activeBot ? 9 : 1;
        const [created] = await client_1.db
            .insert(atendimento_db_schema_1.tickets)
            .values({ company_id: companyId, contact_id: contactId, connection_id: connectionId ?? null, serialized_id: serializedId ?? null, origin, status_id: initialStatusId })
            .returning();
        (0, socket_1.emitToCompany)(companyId, 'ticket:created', { ticket: created });
        return { ticket: created, created: true };
    },
    async get(ticketId, companyId) {
        const [ticket] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        return ticket ?? null;
    },
    /**
     * Histórico de atendimentos de um contato — todos os tickets (aberto e
     * fechados) para montar a timeline consolidada na tela de chat, sem
     * precisar reabrir/reaproveitar o ticket antigo (cada um continua sendo
     * um registro definitivo, preservando venda/ocorrência individuais).
     */
    async listByContact(contactId, companyId) {
        const attendantUser = (0, pg_core_1.alias)(auth_schema_1.users, 'attendant_user');
        const closerUser = (0, pg_core_1.alias)(auth_schema_1.users, 'closer_user');
        const rows = await client_1.db
            .select({
            ticket: atendimento_db_schema_1.tickets,
            attendant_name: attendantUser.name,
            closed_by_name: closerUser.name,
        })
            .from(atendimento_db_schema_1.tickets)
            .leftJoin(attendantUser, (0, drizzle_orm_1.eq)(attendantUser.id, atendimento_db_schema_1.tickets.attendant_user_id))
            .leftJoin(closerUser, (0, drizzle_orm_1.eq)(closerUser.id, atendimento_db_schema_1.tickets.closed_by_user_id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, contactId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at)))
            .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.created_at));
        return rows.map(r => ({ ...r.ticket, attendant_name: r.attendant_name, closed_by_name: r.closed_by_name }));
    },
    // ── Listagem ─────────────────────────────────────────────────────────────
    async list(companyId, filters = {}) {
        const conditions = [
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId),
            (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at),
        ];
        if (filters.viewer) {
            const vis = await ticketVisibilityCondition(companyId, filters.viewer.userId, filters.viewer.profileTag);
            if (vis)
                conditions.push(vis);
        }
        if (filters.statusIds?.length)
            conditions.push((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.status_id, filters.statusIds));
        if (filters.attendantId)
            conditions.push((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, filters.attendantId));
        if (filters.connectionId)
            conditions.push((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.connection_id, filters.connectionId));
        if (filters.queueId)
            conditions.push((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.queue_id, filters.queueId));
        if (filters.mineUserId)
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, filters.mineUserId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.closed_by_user_id, filters.mineUserId)));
        if (filters.dateInit)
            conditions.push((0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, new Date(filters.dateInit)));
        if (filters.dateEnd)
            conditions.push((0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.updated_at, new Date(filters.dateEnd)));
        // Tickets fechados (status 3) sem filtro de data: mostra apenas últimos 3 dias
        const onlyClosedFilter = filters.statusIds?.length === 1 && filters.statusIds[0] === 3;
        if (onlyClosedFilter && !filters.dateInit) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 3);
            conditions.push((0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.updated_at, cutoff));
        }
        // Busca por nome/número do contato
        if (filters.search) {
            const term = filters.search.trim();
            const matchIds = await client_1.db
                .select({ id: atendimento_db_schema_1.contacts.id })
                .from(atendimento_db_schema_1.contacts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.name, `%${term}%`), (0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.number, `%${term}%`))));
            const ids = matchIds.map(c => c.id);
            if (ids.length === 0)
                return [];
            conditions.push((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.contact_id, ids));
        }
        const limit = filters.limit ?? 100;
        const offset = filters.offset ?? 0;
        return client_1.db
            .select()
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `${atendimento_db_schema_1.tickets.pinned}`), filters.orderBy === 'ASC' ? (0, drizzle_orm_1.asc)(atendimento_db_schema_1.tickets.updated_at) : (0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.updated_at))
            .limit(limit)
            .offset(offset);
    },
    // ── Contagem por status ───────────────────────────────────────────────────
    async count(companyId, userId, profileTag) {
        const vis = await ticketVisibilityCondition(companyId, userId, profileTag);
        const rows = await client_1.db
            .select({
            status_id: atendimento_db_schema_1.tickets.status_id,
            total: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at), vis))
            .groupBy(atendimento_db_schema_1.tickets.status_id);
        const map = new Map(rows.map(r => [Number(r.status_id), r.total]));
        return {
            pending: map.get(1) ?? 0,
            open: map.get(2) ?? 0,
            closed: map.get(3) ?? 0,
        };
    },
    // ── Transições de status ──────────────────────────────────────────────────
    /** Atendente assume o ticket (Pendente=1 ou Bot=9 → Aberto=2). Update atômico condicional. */
    async assignAttendant(ticketId, userId, companyId) {
        const lockKey = `ticket:${ticketId}`;
        if (!acquireLock(lockKey))
            throw new Error('Ticket já está sendo assumido por outro atendente');
        try {
            const [current] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
                .limit(1);
            if (!current)
                throw new Error('Ticket não encontrado');
            // Verifica limite de atendimentos simultâneos por atendente
            const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
            if (perms.limit_services_users) {
                const [{ cnt }] = await client_1.db
                    .select({ cnt: (0, drizzle_orm_1.sql) `count(*)::int` })
                    .from(atendimento_db_schema_1.tickets)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.attendant_user_id, userId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.status_id, 2), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at)));
                if (cnt >= (perms.number_limit_services_users ?? 5)) {
                    throw new Error('Limite de atendimentos simultâneos atingido');
                }
            }
            // Update atômico condicional: só aplica se o ticket ainda estiver
            // Pendente(1) ou em Bot(9) e sem atendente — garante que o bot
            // rodando em paralelo (ou outro atendente) nunca vence uma corrida
            // silenciosamente. Se 0 linhas afetadas, alguém chegou primeiro.
            const [updated] = await client_1.db
                .update(atendimento_db_schema_1.tickets)
                .set({ status_id: 2, attendant_user_id: userId, updated_at: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.status_id, [1, 9]), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.attendant_user_id)))
                .returning();
            if (!updated)
                throw new Error('Ticket já foi assumido por outro atendente ou não está mais disponível');
            await client_1.db.insert(atendimento_db_schema_1.historic_tickets).values({
                ticket_id: ticketId,
                user_id: userId,
                status_id_init: current.status_id,
                status_id_end: 2,
            });
            (0, socket_1.emitToCompany)(companyId, 'ticket:updated', { ticket: updated });
            // Mensagens automáticas de saudação e protocolo (fire-and-forget)
            this._sendOpeningMessages(updated, userId, companyId, perms).catch(() => { });
            return updated;
        }
        finally {
            releaseLock(lockKey);
        }
    },
    async _sendOpeningMessages(ticket, userId, companyId, perms) {
        if (!ticket.connection_id || !ticket.contact_id)
            return;
        const [contactRow] = await client_1.db
            .select({ number: atendimento_db_schema_1.contacts.number, lid: atendimento_db_schema_1.contacts.lid })
            .from(atendimento_db_schema_1.contacts)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, ticket.contact_id))
            .limit(1);
        const target = contactRow?.number || (contactRow?.lid ? `lid:${contactRow.lid}` : null);
        if (!target)
            return;
        const [companyRow] = await client_1.db
            .select({ init_message: company_db_schema_1.companies.init_message })
            .from(company_db_schema_1.companies)
            .where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId))
            .limit(1);
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        if (perms.show_ticket_name_message && companyRow?.init_message) {
            // Dedup: evita repetir a mensagem de abertura pro mesmo contato em
            // sequência rápida (ex.: reabrir/reatribuir várias vezes seguidas).
            const intervalHours = perms.interval_between_init_message ?? 1;
            const cutoff = new Date(Date.now() - intervalHours * 3600 * 1000);
            const [recent] = await client_1.db
                .select({ id: atendimento_db_schema_1.atendimento_messages.id })
                .from(atendimento_db_schema_1.atendimento_messages)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.contact_id, ticket.contact_id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.media_type, 'auto_init'), (0, drizzle_orm_1.gte)(atendimento_db_schema_1.atendimento_messages.created_at, cutoff)))
                .limit(1);
            if (!recent) {
                const [attendant] = await client_1.db
                    .select({ name: auth_schema_1.users.name })
                    .from(auth_schema_1.users)
                    .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId))
                    .limit(1);
                const msg = fillMessageTemplate(companyRow.init_message, { atendente: attendant?.name ?? 'nosso atendente', ticketId: ticket.id });
                const { messageService } = await Promise.resolve().then(() => __importStar(require('./message.service')));
                await messageService.save(ticket.id, ticket.contact_id, msg, true, companyId, { userId, mediaType: 'auto_init' });
                await whatsappService.sendTextToPhone(ticket.connection_id, target, msg);
            }
        }
        if (perms.send_ticket_protocol) {
            await whatsappService.sendTextToPhone(ticket.connection_id, target, `O número do protocolo de atendimento é *#${ticket.id}*.`);
        }
    },
    /**
     * Roteia um ticket para uma fila (usado pelo chatbot). Seta `queue_id` e, se a
     * fila tiver distribuição automática e houver atendente elegível/online, atribui
     * (status 1 → 2). Sem atendente elegível, o ticket fica pendente na fila.
     */
    async routeToQueue(ticketId, companyId, queueId) {
        const [current] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!current)
            return null;
        // Já atribuído a um atendente → não mexe (não rouba ticket em atendimento)
        if (current.status_id === 2 && current.attendant_user_id)
            return current;
        const { distributeTicket } = await Promise.resolve().then(() => __importStar(require('../filas/queue-distribution.service')));
        const chosen = await distributeTicket(companyId, queueId, current.connection_id);
        if (chosen) {
            await client_1.db.insert(atendimento_db_schema_1.historic_tickets).values({
                ticket_id: ticketId,
                user_id: chosen,
                status_id_init: current.status_id,
                status_id_end: 2,
            });
        }
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({
            queue_id: queueId,
            ...(chosen ? { status_id: 2, attendant_user_id: chosen } : {}),
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId))
            .returning();
        (0, socket_1.emitToCompany)(companyId, 'ticket:updated', { ticket: updated });
        // Saudação da fila — só na primeira vez que o ticket entra numa fila
        // (transferência manual entre filas não reenvia, só a nota interna).
        if (!current.queue_id) {
            this._sendQueueGreeting(updated, queueId).catch((err) => console.error(`[Queue] Falha ao enviar saudação (ticket ${ticketId}, fila ${queueId}):`, err instanceof Error ? err.message : err));
        }
        return updated;
    },
    async _sendQueueGreeting(ticket, queueId) {
        if (!ticket.connection_id || !ticket.contact_id)
            return;
        const [queueRow] = await client_1.db
            .select({ greeting_message: atendimento_db_schema_1.queues.greeting_message })
            .from(atendimento_db_schema_1.queues)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.queues.id, queueId))
            .limit(1);
        if (!queueRow?.greeting_message)
            return;
        const [contactRow] = await client_1.db
            .select({ number: atendimento_db_schema_1.contacts.number, lid: atendimento_db_schema_1.contacts.lid })
            .from(atendimento_db_schema_1.contacts)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, ticket.contact_id))
            .limit(1);
        const target = contactRow?.number || (contactRow?.lid ? `lid:${contactRow.lid}` : null);
        if (!target)
            return;
        const { messageService } = await Promise.resolve().then(() => __importStar(require('./message.service')));
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        await messageService.save(ticket.id, ticket.contact_id, queueRow.greeting_message, true, ticket.company_id, { mediaType: 'auto_queue_greeting' });
        await whatsappService.sendTextToPhone(ticket.connection_id, target, queueRow.greeting_message);
    },
    /** Devolve o ticket para a fila (2 → 1). Zera o atendente. */
    async returnToQueue(ticketId, userId, companyId) {
        const [current] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!current)
            throw new Error('Ticket não encontrado');
        await client_1.db.insert(atendimento_db_schema_1.historic_tickets).values({
            ticket_id: ticketId,
            user_id: userId,
            status_id_init: current.status_id,
            status_id_end: 1,
        });
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ status_id: 1, attendant_user_id: null, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId))
            .returning();
        (0, socket_1.emitToCompany)(companyId, 'ticket:updated', { ticket: updated });
        return updated;
    },
    /** Reabre um ticket finalizado (3 → 2). Verifica se não há outro aberto para o mesmo contato. */
    async reopen(ticketId, userId, companyId) {
        const [current] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!current)
            throw new Error('Ticket não encontrado');
        // Verifica se já existe outro ticket aberto para o mesmo contato+conexão
        const [alreadyOpen] = await client_1.db.select({ id: atendimento_db_schema_1.tickets.id }).from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, current.contact_id), (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.status_id, [1, 2]), (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at)))
            .limit(1);
        if (alreadyOpen)
            throw new Error('Já existe um ticket aberto para este contato');
        await client_1.db.insert(atendimento_db_schema_1.historic_tickets).values({
            ticket_id: ticketId,
            user_id: userId,
            status_id_init: current.status_id,
            status_id_end: 2,
        });
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ status_id: 2, attendant_user_id: userId, closed_by_user_id: null, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId))
            .returning();
        (0, socket_1.emitToCompany)(companyId, 'ticket:updated', { ticket: updated });
        return updated;
    },
    /** Transfere o ticket para outro atendente. Cria mensagem interna de transferência. */
    async transfer(ticketId, fromUserId, toUserId, companyId, queueId) {
        const [current] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!current)
            throw new Error('Ticket não encontrado');
        const [fromUser] = await client_1.db.select({ name: auth_schema_1.users.name }).from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, fromUserId)).limit(1);
        const [toUser] = await client_1.db.select({ name: auth_schema_1.users.name }).from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, toUserId)).limit(1);
        if (!toUser)
            throw new Error('Atendente destino não encontrado');
        await client_1.db.insert(atendimento_db_schema_1.historic_tickets).values({
            ticket_id: ticketId,
            user_id: fromUserId,
            status_id_init: current.status_id,
            status_id_end: 2,
        });
        const set = {
            attendant_user_id: toUserId,
            is_transfer: 1,
            status_id: 2,
            updated_at: new Date(),
        };
        if (queueId !== undefined)
            set.queue_id = queueId;
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set(set)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId))
            .returning();
        const fromName = fromUser?.name ?? 'Atendente anterior';
        await client_1.db.insert(atendimento_db_schema_1.atendimento_messages).values({
            ticket_id: ticketId,
            body: `Atendimento transferido de *${fromName}* para *${toUser.name}*`,
            from_me: true,
            user_id: fromUserId,
        });
        (0, socket_1.emitToCompany)(companyId, 'ticket:updated', { ticket: updated });
        // Mensagem de transferência para o cliente (fire-and-forget)
        this._sendTransferMessage(updated, companyId, fromUser?.name, toUser.name).catch(() => { });
        return updated;
    },
    async _sendTransferMessage(ticket, companyId, fromName, toName) {
        if (!ticket.connection_id || !ticket.contact_id)
            return;
        const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
        if (!perms.send_ticket_transfer_msg)
            return;
        const [companyRow] = await client_1.db
            .select({ transfer_message: company_db_schema_1.companies.transfer_message })
            .from(company_db_schema_1.companies)
            .where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId))
            .limit(1);
        if (!companyRow?.transfer_message)
            return;
        const [contactRow] = await client_1.db
            .select({ number: atendimento_db_schema_1.contacts.number, lid: atendimento_db_schema_1.contacts.lid })
            .from(atendimento_db_schema_1.contacts)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, ticket.contact_id))
            .limit(1);
        const target = contactRow?.number || (contactRow?.lid ? `lid:${contactRow.lid}` : null);
        if (!target)
            return;
        const msg = companyRow.transfer_message
            .replace(/\{atendente_anterior\}/gi, fromName ?? 'atendente anterior')
            .replace(/\{atendente\}/gi, toName);
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        await whatsappService.sendTextToPhone(ticket.connection_id, target, msg);
    },
    /** Alterna fixação do ticket no topo da lista. */
    async togglePin(ticketId, companyId) {
        const [current] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!current)
            throw new Error('Ticket não encontrado');
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ pinned: current.pinned ? 0 : 1, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId))
            .returning();
        (0, socket_1.emitToCompany)(companyId, 'ticket:updated', { ticket: updated });
        return updated;
    },
    // ── Operações existentes ──────────────────────────────────────────────────
    async closeTicket(ticketId, userId, companyId, opts = {}) {
        const [current] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!current)
            throw new Error('Ticket não encontrado');
        await client_1.db.insert(atendimento_db_schema_1.historic_tickets).values({
            ticket_id: ticketId,
            user_id: userId,
            status_id_init: current.status_id,
            status_id_end: 3,
        });
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({
            status_id: 3,
            closed_by_user_id: userId,
            ocurrence: opts.ocurrence ?? null,
            service_not_made: opts.service_not_made ? 1 : 0,
            pinned: 0,
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .returning();
        (0, socket_1.emitToCompany)(companyId, 'ticket:closed', { ticketId });
        // Mensagem de despedida (fire-and-forget). Se o fechamento manual informou
        // a escolha (com/sem mensagem), ela sobrepõe a permissão global. Erro no envio
        // (ex.: conexão do WhatsApp caída) não impede o fechamento, mas é logado —
        // antes era engolido em silêncio, escondendo desconexões do bays.
        this._sendClosingMessage(updated, companyId, opts.sendGoodbye, userId).catch((err) => console.error(`[Close] Falha ao enviar mensagem de despedida (ticket ${ticketId}):`, err instanceof Error ? err.message : err));
        return updated;
    },
    /**
     * Fechamento alternativo: em vez de despedida, pergunta a pesquisa de
     * satisfação. O ticket NÃO fecha ainda — vai para status 7 (Realizando
     * Pesquisa) e só vira Fechado (3) de fato quando o cliente responder
     * (ver pesquisaService.tryRecordAnswer → finalizeAfterResearch). É uma
     * alternativa exclusiva à despedida, nunca as duas juntas.
     */
    async closeTicketWithResearch(ticketId, userId, companyId) {
        const [current] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!current)
            throw new Error('Ticket não encontrado');
        const { pesquisaService } = await Promise.resolve().then(() => __importStar(require('../pesquisas/pesquisa.service')));
        const research = await pesquisaService.findActiveForQueue(current.queue_id, companyId);
        if (!research)
            throw new Error('Nenhuma pesquisa de satisfação configurada para este atendimento');
        await client_1.db.insert(atendimento_db_schema_1.historic_tickets).values({
            ticket_id: ticketId,
            user_id: userId,
            status_id_init: current.status_id,
            status_id_end: 7,
        });
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ status_id: 7, closed_by_user_id: userId, pinned: 0, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .returning();
        (0, socket_1.emitToCompany)(companyId, 'ticket:updated', { ticket: updated });
        await pesquisaService.sendSurveyQuestion(updated, research);
        return updated;
    },
    /** Fecha de fato o ticket depois que a pesquisa de satisfação foi respondida (status 7 → 3). */
    async finalizeAfterResearch(ticketId, companyId) {
        const [current] = await client_1.db.select().from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!current || current.status_id !== 7)
            return;
        await client_1.db.insert(atendimento_db_schema_1.historic_tickets).values({
            ticket_id: ticketId,
            user_id: current.closed_by_user_id,
            status_id_init: 7,
            status_id_end: 3,
        });
        await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ status_id: 3, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId));
        (0, socket_1.emitToCompany)(companyId, 'ticket:closed', { ticketId });
    },
    /**
     * Envia a mensagem de despedida ao fechar o ticket.
     *
     * @param sendGoodbye  Escolha explícita do fechamento manual:
     *   - true      → envia, ignorando a permissão global
     *   - false     → não envia
     *   - undefined → comportamento automático (respeita send_ticket_goodbye_msg)
     */
    async _sendClosingMessage(ticket, companyId, sendGoodbye, userId) {
        if (!ticket.contact_id)
            return;
        if (sendGoodbye === false)
            return;
        const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
        if (sendGoodbye === undefined && !perms.send_ticket_goodbye_msg)
            return;
        const [companyRow] = await client_1.db
            .select({ end_message: company_db_schema_1.companies.end_message })
            .from(company_db_schema_1.companies)
            .where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId))
            .limit(1);
        if (!companyRow?.end_message)
            return;
        const [contactRow] = await client_1.db
            .select({ number: atendimento_db_schema_1.contacts.number, lid: atendimento_db_schema_1.contacts.lid })
            .from(atendimento_db_schema_1.contacts)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, ticket.contact_id))
            .limit(1);
        const target = contactRow?.number || (contactRow?.lid ? `lid:${contactRow.lid}` : null);
        if (!target)
            return;
        if (!ticket.connection_id) {
            console.warn(`[_sendClosingMessage] Sem connection_id para ticket ${ticket.id} (contact: ${target}). Mensagem não será enviada.`);
            return;
        }
        // Dedup: evita reenviar despedida pro mesmo contato em sequência rápida
        // (ex.: fecha e reabre vários tickets seguidos em pouco tempo).
        const intervalHours = perms.interval_between_ended_message ?? 6;
        const cutoff = new Date(Date.now() - intervalHours * 3600 * 1000);
        const [recent] = await client_1.db
            .select({ id: atendimento_db_schema_1.atendimento_messages.id })
            .from(atendimento_db_schema_1.atendimento_messages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.contact_id, ticket.contact_id), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.media_type, 'auto_goodbye'), (0, drizzle_orm_1.gte)(atendimento_db_schema_1.atendimento_messages.created_at, cutoff)))
            .limit(1);
        if (recent)
            return;
        const [closer] = await client_1.db.select({ name: auth_schema_1.users.name }).from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId)).limit(1);
        const text = fillMessageTemplate(companyRow.end_message, { atendente: closer?.name ?? 'atendente', ticketId: ticket.id });
        const { messageService } = await Promise.resolve().then(() => __importStar(require('./message.service')));
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        await messageService.save(ticket.id, ticket.contact_id, text, true, companyId, { userId, mediaType: 'auto_goodbye' });
        await whatsappService.sendTextToPhone(ticket.connection_id, target, text);
    },
    async registerSale(ticketId, companyId, payload) {
        const set = payload.isSale
            ? { is_sale: 1, sale_price: payload.saleAmount ?? '0,00', reasons_id: null, loss_product_name: null }
            : { is_sale: 0, sale_price: '0,00', reasons_id: payload.lossReasonId ?? null, loss_product_name: payload.lossProductName ?? null };
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ ...set, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .returning();
        if (!updated)
            throw new Error('Ticket não encontrado');
        return updated;
    },
    /** @deprecated use assignAttendant — mantido para compatibilidade */
    async updateStatus(ticketId, statusId, companyId) {
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ status_id: statusId, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .returning();
        if (!updated)
            throw new Error('Ticket não encontrado');
        (0, socket_1.emitToCompany)(companyId, 'ticket:updated', { ticket: updated });
        return updated;
    },
    // ── Funil Kanban de atendimento ───────────────────────────────────────────
    async createFunilLead(companyId, payload) {
        const { contactService } = await Promise.resolve().then(() => __importStar(require('./contact.service')));
        let contact;
        if (payload.phone?.trim()) {
            contact = await contactService.findOrCreate(companyId, payload.phone.trim(), payload.name?.trim() || undefined);
            // atualiza nome/email se veio preenchido
            if (payload.name?.trim() || payload.email?.trim()) {
                const [updated] = await client_1.db.update(atendimento_db_schema_1.contacts)
                    .set({
                    ...(payload.name?.trim() && { name: payload.name.trim() }),
                    ...(payload.email?.trim() && { email: payload.email.trim() }),
                })
                    .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, contact.id))
                    .returning();
                contact = updated ?? contact;
            }
        }
        else {
            const [created] = await client_1.db.insert(atendimento_db_schema_1.contacts).values({
                company_id: companyId,
                name: payload.name?.trim() || 'Sem nome',
                email: payload.email?.trim() || null,
                origin: 'funil_manual',
            }).returning();
            contact = created;
        }
        const stage = payload.funil_stage || 'novos_leads';
        const [ticket] = await client_1.db.insert(atendimento_db_schema_1.tickets).values({
            company_id: companyId,
            contact_id: contact.id,
            status_id: 1,
            funil_stage: stage,
            origin: 'funil_manual',
            ocurrence: payload.notes?.trim() || null,
        }).returning();
        (0, socket_1.emitToCompany)(companyId, 'ticket:created', { ticket });
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
    async getFunilCards(companyId, search) {
        const conditions = [
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId),
            (0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.status_id, [1, 2]),
            (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at),
        ];
        if (search) {
            const term = search.trim();
            const matchIds = await client_1.db
                .select({ id: atendimento_db_schema_1.contacts.id })
                .from(atendimento_db_schema_1.contacts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.company_id, companyId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.name, `%${term}%`), (0, drizzle_orm_1.ilike)(atendimento_db_schema_1.contacts.number, `%${term}%`))));
            const ids = matchIds.map((c) => c.id);
            if (ids.length === 0)
                return [];
            conditions.push((0, drizzle_orm_1.inArray)(atendimento_db_schema_1.tickets.contact_id, ids));
        }
        return client_1.db
            .select({
            id: atendimento_db_schema_1.tickets.id,
            funil_stage: atendimento_db_schema_1.tickets.funil_stage,
            contact_id: atendimento_db_schema_1.tickets.contact_id,
            contact_name: atendimento_db_schema_1.contacts.name,
            contact_number: atendimento_db_schema_1.contacts.number,
            contact_profile_pic_url: atendimento_db_schema_1.contacts.profile_pic_url,
            status_id: atendimento_db_schema_1.tickets.status_id,
            created_at: atendimento_db_schema_1.tickets.created_at,
        })
            .from(atendimento_db_schema_1.tickets)
            .leftJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.contact_id, atendimento_db_schema_1.contacts.id))
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(atendimento_db_schema_1.tickets.created_at));
    },
    async updateFunilStage(ticketId, stage, companyId) {
        const VALID_STAGES = ['novos_leads', 'primeiro_contato', 'agendado', 'atendimento', 'convertido'];
        if (!VALID_STAGES.includes(stage))
            throw new Error('Etapa inválida');
        const [updated] = await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ funil_stage: stage, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .returning();
        if (!updated)
            throw new Error('Ticket não encontrado');
        (0, socket_1.emitToCompany)(companyId, 'ticket:funil_stage_updated', { ticketId, stage });
        return updated;
    },
    // ── Relatório: status por contato ─────────────────────────────────────────
    async statusByContact(companyId, params) {
        const { dateInit, dateEnd, limit = 50, offset = 0 } = params;
        const conditions = [
            (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId),
            (0, drizzle_orm_1.isNull)(atendimento_db_schema_1.tickets.deleted_at),
        ];
        if (dateInit)
            conditions.push((0, drizzle_orm_1.gte)(atendimento_db_schema_1.tickets.created_at, new Date(dateInit)));
        if (dateEnd)
            conditions.push((0, drizzle_orm_1.lte)(atendimento_db_schema_1.tickets.created_at, new Date(dateEnd + 'T23:59:59')));
        const where = (0, drizzle_orm_1.and)(...conditions);
        const [rows, countRows] = await Promise.all([
            client_1.db
                .select({
                contact_id: atendimento_db_schema_1.tickets.contact_id,
                contact_name: atendimento_db_schema_1.contacts.name,
                contact_number: atendimento_db_schema_1.contacts.number,
                open: (0, drizzle_orm_1.sql) `cast(count(case when ${atendimento_db_schema_1.tickets.status_id} = 1 then 1 end) as int)`,
                pending: (0, drizzle_orm_1.sql) `cast(count(case when ${atendimento_db_schema_1.tickets.status_id} = 2 then 1 end) as int)`,
                closed: (0, drizzle_orm_1.sql) `cast(count(case when ${atendimento_db_schema_1.tickets.status_id} = 3 then 1 end) as int)`,
                total: (0, drizzle_orm_1.sql) `cast(count(*) as int)`,
            })
                .from(atendimento_db_schema_1.tickets)
                .innerJoin(atendimento_db_schema_1.contacts, (0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, atendimento_db_schema_1.tickets.contact_id))
                .where(where)
                .groupBy(atendimento_db_schema_1.tickets.contact_id, atendimento_db_schema_1.contacts.name, atendimento_db_schema_1.contacts.number)
                .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `count(*)`))
                .limit(limit)
                .offset(offset),
            client_1.db
                .select({ count: (0, drizzle_orm_1.sql) `cast(count(distinct ${atendimento_db_schema_1.tickets.contact_id}) as int)` })
                .from(atendimento_db_schema_1.tickets)
                .where(where),
        ]);
        return { items: rows, total: countRows[0]?.count ?? 0 };
    },
    // ── Atendentes da empresa ─────────────────────────────────────────────────
    async listAttendants(companyId) {
        return client_1.db
            .select({ id: auth_schema_1.users.id, name: auth_schema_1.users.name, email: auth_schema_1.users.email })
            .from(auth_schema_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(auth_schema_1.users.company_id, companyId), (0, drizzle_orm_1.eq)(auth_schema_1.users.is_approved, true)))
            .orderBy(auth_schema_1.users.name);
    },
};
//# sourceMappingURL=ticket.service.js.map