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
exports.apiMessagesService = exports.ConnectionNotFoundError = exports.ApiMessagesDisabledError = void 0;
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const api_messages_db_schema_1 = require("./api-messages.db.schema");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const configuracao_geral_service_1 = require("../configuracao-geral/configuracao-geral.service");
const contact_service_1 = require("../atendimento/contact.service");
const ticket_service_1 = require("../atendimento/ticket.service");
const KEY_PREFIX = 'kelmor_';
function hashKey(rawKey) {
    return (0, crypto_1.createHash)('sha256').update(rawKey).digest('hex');
}
class ApiMessagesDisabledError extends Error {
    constructor() { super('Envio de mensagens via API está desativado para esta empresa'); }
}
exports.ApiMessagesDisabledError = ApiMessagesDisabledError;
class ConnectionNotFoundError extends Error {
    constructor() { super('Conexão não encontrada para esta empresa'); }
}
exports.ConnectionNotFoundError = ConnectionNotFoundError;
exports.apiMessagesService = {
    // ── Gestão da chave (autenticado por JWT de admin) ──────────────────────
    /** Gera (ou substitui) a chave da empresa. Retorna o valor em texto puro — única vez que ele existe. */
    async generateKey(companyId) {
        const rawKey = `${KEY_PREFIX}${(0, crypto_1.randomBytes)(24).toString('hex')}`;
        const prefix = rawKey.slice(0, 14);
        const hash = hashKey(rawKey);
        await client_1.db.insert(api_messages_db_schema_1.companyApiKeys)
            .values({ company_id: companyId, key_hash: hash, key_prefix: prefix })
            .onConflictDoUpdate({
            target: api_messages_db_schema_1.companyApiKeys.company_id,
            set: { key_hash: hash, key_prefix: prefix, created_at: new Date(), revoked_at: null },
        });
        return { key: rawKey, prefix };
    },
    async getKeyStatus(companyId) {
        const [row] = await client_1.db.select().from(api_messages_db_schema_1.companyApiKeys)
            .where((0, drizzle_orm_1.eq)(api_messages_db_schema_1.companyApiKeys.company_id, companyId))
            .limit(1);
        if (!row || row.revoked_at)
            return { active: false, prefix: null, createdAt: null };
        return { active: true, prefix: row.key_prefix, createdAt: row.created_at };
    },
    async revokeKey(companyId) {
        await client_1.db.update(api_messages_db_schema_1.companyApiKeys)
            .set({ revoked_at: new Date() })
            .where((0, drizzle_orm_1.eq)(api_messages_db_schema_1.companyApiKeys.company_id, companyId));
    },
    /** Resolve a empresa dona de uma chave ativa (não revogada), ou null se inválida. */
    async resolveCompanyByKey(rawKey) {
        const hash = hashKey(rawKey);
        const [row] = await client_1.db.select({ company_id: api_messages_db_schema_1.companyApiKeys.company_id })
            .from(api_messages_db_schema_1.companyApiKeys)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(api_messages_db_schema_1.companyApiKeys.key_hash, hash), (0, drizzle_orm_1.isNull)(api_messages_db_schema_1.companyApiKeys.revoked_at)))
            .limit(1);
        return row?.company_id ?? null;
    },
    // ── Envio (autenticado por X-Api-Key) ───────────────────────────────────
    /**
     * Envia uma mensagem transacional e grava o log de auditoria sempre. Se
     * `create_ticket_api_msg` estiver ligado, também vincula ao histórico de
     * conversa do contato (ticket existente ou um novo já fechado) — ver
     * `ticketService.attachExternalMessage`.
     */
    async sendMessage(companyId, params) {
        const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
        if (!perms.api_messages)
            throw new ApiMessagesDisabledError();
        const [conn] = await client_1.db.select().from(atendimento_db_schema_1.connections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.id, params.connectionId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.connections.company_id, companyId)))
            .limit(1);
        if (!conn)
            throw new ConnectionNotFoundError();
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        await whatsappService.sendTextToPhone(params.connectionId, params.number, params.message);
        const [log] = await client_1.db.insert(api_messages_db_schema_1.apiMessagesLog).values({
            company_id: companyId,
            connection_id: params.connectionId,
            to_number: params.number,
            body: params.message,
        }).returning();
        if (!perms.create_ticket_api_msg)
            return { ticketId: null };
        const contact = await contact_service_1.contactService.findOrCreate(companyId, params.number);
        const ticket = await ticket_service_1.ticketService.attachExternalMessage(companyId, contact.id, params.connectionId, params.message);
        await client_1.db.update(api_messages_db_schema_1.apiMessagesLog).set({ ticket_id: ticket.id }).where((0, drizzle_orm_1.eq)(api_messages_db_schema_1.apiMessagesLog.id, log.id));
        return { ticketId: ticket.id };
    },
};
//# sourceMappingURL=api-messages.service.js.map