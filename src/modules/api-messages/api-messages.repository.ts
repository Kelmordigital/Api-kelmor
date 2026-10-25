import { eq, and, isNull } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { companyApiKeys, apiMessagesLog } from './api-messages.db.schema';

export interface ApiKeyRecord {
    key_prefix: string;
    created_at: Date | null;
    revoked_at: Date | null;
}

/** Chave de API da empresa (uma por empresa; só o hash é guardado). */
export interface ApiKeyRepository {
    /** Cria ou substitui a chave da empresa (a anterior deixa de valer). */
    save(companyId: string, hash: string, prefix: string): Promise<void>;
    findByCompany(companyId: string): Promise<ApiKeyRecord | null>;
    revoke(companyId: string): Promise<void>;
    /** Empresa dona de uma chave ativa com esse hash. */
    companyByActiveHash(hash: string): Promise<string | null>;
}

export interface ApiMessageLogRepository {
    record(entry: { company_id: string; connection_id: number; to_number: string; body: string }): Promise<number>;
    linkTicket(logId: number, ticketId: number): Promise<void>;
}

export class DrizzleApiKeyRepository implements ApiKeyRepository {
    constructor(private readonly db: DB) {}

    async save(companyId: string, hash: string, prefix: string): Promise<void> {
        await this.db.insert(companyApiKeys)
            .values({ company_id: companyId, key_hash: hash, key_prefix: prefix })
            .onConflictDoUpdate({
                target: companyApiKeys.company_id,
                set: { key_hash: hash, key_prefix: prefix, created_at: new Date(), revoked_at: null },
            });
    }

    async findByCompany(companyId: string): Promise<ApiKeyRecord | null> {
        const [row] = await this.db.select().from(companyApiKeys).where(eq(companyApiKeys.company_id, companyId)).limit(1);
        return row ?? null;
    }

    async revoke(companyId: string): Promise<void> {
        await this.db.update(companyApiKeys).set({ revoked_at: new Date() }).where(eq(companyApiKeys.company_id, companyId));
    }

    async companyByActiveHash(hash: string): Promise<string | null> {
        const [row] = await this.db.select({ company_id: companyApiKeys.company_id }).from(companyApiKeys)
            .where(and(eq(companyApiKeys.key_hash, hash), isNull(companyApiKeys.revoked_at)))
            .limit(1);
        return row?.company_id ?? null;
    }
}

export class DrizzleApiMessageLogRepository implements ApiMessageLogRepository {
    constructor(private readonly db: DB) {}

    async record(entry: { company_id: string; connection_id: number; to_number: string; body: string }): Promise<number> {
        const [row] = await this.db.insert(apiMessagesLog).values(entry).returning({ id: apiMessagesLog.id });
        return row.id;
    }

    async linkTicket(logId: number, ticketId: number): Promise<void> {
        await this.db.update(apiMessagesLog).set({ ticket_id: ticketId }).where(eq(apiMessagesLog.id, logId));
    }
}
