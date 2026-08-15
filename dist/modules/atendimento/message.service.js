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
exports.messageService = void 0;
exports.withAttendantNamePrefix = withAttendantNamePrefix;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("./atendimento.db.schema");
const socket_1 = require("../../shared/socket");
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Prefixa `*Nome:*` na mensagem enviada por um atendente (config "Ocultar
 * nome do atendente no chat") — ponto único usado por todo caminho de envio
 * manual (digitação e mensagens rápidas passam pelo mesmo endpoint), pra não
 * reescrever essa regra em mais de um lugar. Não duplica o prefixo se o
 * texto já começar com ele (ex.: atendente reenviando algo já assinado).
 */
function withAttendantNamePrefix(body, name) {
    const already = new RegExp(`^\\*${escapeRegExp(name)}:\\*`, 'i').test(body.trim());
    if (already)
        return body;
    return `*${name}:*\n${body}`;
}
exports.messageService = {
    async save(ticketId, contactId, body, fromMe, companyId, opts = {}) {
        const [msg] = await client_1.db
            .insert(atendimento_db_schema_1.atendimento_messages)
            .values({
            ticket_id: ticketId,
            contact_id: contactId,
            user_id: opts.userId ?? null,
            body,
            from_me: fromMe,
            media_type: opts.mediaType ?? null,
            media_url: opts.mediaUrl ?? null,
            media_waveform: opts.mediaWaveform ?? null,
            media_seconds: opts.mediaSeconds ?? null,
        })
            .returning();
        await client_1.db
            .update(atendimento_db_schema_1.tickets)
            .set({ updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId));
        (0, socket_1.emitToCompany)(companyId, 'message:created', { message: msg, ticketId });
        if (body && contactId !== null) {
            try {
                const { matchAndApplyAutomaticTags } = await Promise.resolve().then(() => __importStar(require('../etiquetas/etiqueta.service')));
                await matchAndApplyAutomaticTags(companyId, contactId, body);
            }
            catch (err) {
                console.error(`[AutoTags] Falha ao aplicar etiquetas automáticas (ticket ${ticketId}):`, err instanceof Error ? err.message : err);
            }
        }
        return msg;
    },
    async list(ticketId, companyId) {
        const [ticket] = await client_1.db
            .select()
            .from(atendimento_db_schema_1.tickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.id, ticketId), (0, drizzle_orm_1.eq)(atendimento_db_schema_1.tickets.company_id, companyId)))
            .limit(1);
        if (!ticket)
            throw new Error('Ticket não encontrado');
        return client_1.db
            .select()
            .from(atendimento_db_schema_1.atendimento_messages)
            .where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.atendimento_messages.ticket_id, ticketId))
            .orderBy((0, drizzle_orm_1.asc)(atendimento_db_schema_1.atendimento_messages.created_at));
    },
};
//# sourceMappingURL=message.service.js.map