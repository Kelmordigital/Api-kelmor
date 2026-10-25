import type { DB } from '../../database/client';
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
    record(entry: {
        company_id: string;
        connection_id: number;
        to_number: string;
        body: string;
    }): Promise<number>;
    linkTicket(logId: number, ticketId: number): Promise<void>;
}
export declare class DrizzleApiKeyRepository implements ApiKeyRepository {
    private readonly db;
    constructor(db: DB);
    save(companyId: string, hash: string, prefix: string): Promise<void>;
    findByCompany(companyId: string): Promise<ApiKeyRecord | null>;
    revoke(companyId: string): Promise<void>;
    companyByActiveHash(hash: string): Promise<string | null>;
}
export declare class DrizzleApiMessageLogRepository implements ApiMessageLogRepository {
    private readonly db;
    constructor(db: DB);
    record(entry: {
        company_id: string;
        connection_id: number;
        to_number: string;
        body: string;
    }): Promise<number>;
    linkTicket(logId: number, ticketId: number): Promise<void>;
}
//# sourceMappingURL=api-messages.repository.d.ts.map