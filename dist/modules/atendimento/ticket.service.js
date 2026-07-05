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
const drizzle_orm_1 = require("drizzle-orm");
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
        const [created] = await client_1.db
            .insert(atendimento_db_schema_1.tickets)
            .values({ company_id: companyId, contact_id: contactId, connection_id: connectionId ?? null, serialized_id: serializedId ?? null, origin, status_id: 1 })
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
    /** Atendente assume o ticket (1 → 2). Protegido por lock em memória. */
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
            if (current.status_id === 2 && current.attendant_user_id) {
                throw new Error('Ticket já está em atendimento');
            }
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
            await client_1.db.insert(atendimento_db_schema_1.historic_tickets).values({
                ticket_id: ticketId,
                user_id: userId,
                status_id_init: current.status_id,
                status_id_end: 2,
            });
            const [updated] = await client_1.db
                .update(atendimento_db_schema_1.tickets)
                .set({ status_id: 2, attendant_user_id: userId, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId))
                .returning();
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
            const [attendant] = await client_1.db
                .select({ name: auth_schema_1.users.name })
                .from(auth_schema_1.users)
                .where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId))
                .limit(1);
            const msg = companyRow.init_message.replace(/\{atendente\}/gi, attendant?.name ?? 'nosso atendente');
            await whatsappService.sendTextToPhone(ticket.connection_id, target, msg);
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
        return updated;
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
        const { atendimento_messages } = await Promise.resolve().then(() => __importStar(require('./atendimento.db.schema')));
        const fromName = fromUser?.name ?? 'Atendente anterior';
        await client_1.db.insert(atendimento_messages).values({
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
        // Mensagem de despedida (fire-and-forget)
        this._sendClosingMessage(updated, companyId).catch(() => { });
        // Pesquisa de satisfação (fire-and-forget)
        const { pesquisaService } = await Promise.resolve().then(() => __importStar(require('../pesquisas/pesquisa.service')));
        pesquisaService.sendSurveyAfterClose(updated).catch((err) => console.error('[Survey] Erro ao enviar pesquisa:', err.message));
        return updated;
    },
    async _sendClosingMessage(ticket, companyId) {
        if (!ticket.connection_id || !ticket.contact_id)
            return;
        const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
        if (!perms.send_ticket_goodbye_msg)
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
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        await whatsappService.sendTextToPhone(ticket.connection_id, target, companyRow.end_message);
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