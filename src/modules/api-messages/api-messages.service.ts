import { randomBytes, createHash } from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../database/client';
import { companyApiKeys, apiMessagesLog } from './api-messages.db.schema';
import { connections } from '../atendimento/atendimento.db.schema';
import { getCompanyPermissions } from '../configuracao-geral/configuracao-geral.service';
import { contactService } from '../atendimento/contact.service';
import { ticketService } from '../atendimento/ticket.service';

const KEY_PREFIX = 'kelmor_';

function hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
}

export class ApiMessagesDisabledError extends Error {
    constructor() { super('Envio de mensagens via API está desativado para esta empresa'); }
}

export class ConnectionNotFoundError extends Error {
    constructor() { super('Conexão não encontrada para esta empresa'); }
}

export const apiMessagesService = {

    // ── Gestão da chave (autenticado por JWT de admin) ──────────────────────

    /** Gera (ou substitui) a chave da empresa. Retorna o valor em texto puro — única vez que ele existe. */
    async generateKey(companyId: string): Promise<{ key: string; prefix: string }> {
        const rawKey = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
        const prefix = rawKey.slice(0, 14);
        const hash = hashKey(rawKey);

        await db.insert(companyApiKeys)
            .values({ company_id: companyId, key_hash: hash, key_prefix: prefix })
            .onConflictDoUpdate({
                target: companyApiKeys.company_id,
                set: { key_hash: hash, key_prefix: prefix, created_at: new Date(), revoked_at: null },
            });

        return { key: rawKey, prefix };
    },

    async getKeyStatus(companyId: string): Promise<{
        active: boolean; prefix: string | null; createdAt: Date | null;
    }> {
        const [row] = await db.select().from(companyApiKeys)
            .where(eq(companyApiKeys.company_id, companyId))
            .limit(1);

        if (!row || row.revoked_at) return { active: false, prefix: null, createdAt: null };
        return { active: true, prefix: row.key_prefix, createdAt: row.created_at };
    },

    async revokeKey(companyId: string): Promise<void> {
        await db.update(companyApiKeys)
            .set({ revoked_at: new Date() })
            .where(eq(companyApiKeys.company_id, companyId));
    },

    /** Resolve a empresa dona de uma chave ativa (não revogada), ou null se inválida. */
    async resolveCompanyByKey(rawKey: string): Promise<string | null> {
        const hash = hashKey(rawKey);
        const [row] = await db.select({ company_id: companyApiKeys.company_id })
            .from(companyApiKeys)
            .where(and(eq(companyApiKeys.key_hash, hash), isNull(companyApiKeys.revoked_at)))
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
    async sendMessage(companyId: string, params: {
        connectionId: number;
        number: string;
        message: string;
    }): Promise<{ ticketId: number | null }> {
        const perms = await getCompanyPermissions(companyId);
        if (!perms.api_messages) throw new ApiMessagesDisabledError();

        const [conn] = await db.select().from(connections)
            .where(and(eq(connections.id, params.connectionId), eq(connections.company_id, companyId)))
            .limit(1);
        if (!conn) throw new ConnectionNotFoundError();

        const { whatsappService } = await import('../whatsapp/whatsapp.service');
        await whatsappService.sendTextToPhone(params.connectionId, params.number, params.message);

        const [log] = await db.insert(apiMessagesLog).values({
            company_id: companyId,
            connection_id: params.connectionId,
            to_number: params.number,
            body: params.message,
        }).returning();

        if (!perms.create_ticket_api_msg) return { ticketId: null };

        const contact = await contactService.findOrCreate(companyId, params.number);
        const ticket = await ticketService.attachExternalMessage(
            companyId, contact.id, params.connectionId, params.message,
        );

        await db.update(apiMessagesLog).set({ ticket_id: ticket.id }).where(eq(apiMessagesLog.id, log.id));

        return { ticketId: ticket.id };
    },
};
