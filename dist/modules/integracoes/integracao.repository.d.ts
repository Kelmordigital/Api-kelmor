import type { DB } from '../../database/client';
import { CompanyIntegration } from './integracao.db.schema';
export interface ConnectionData {
    access_token: string;
    refresh_token: string;
    token_expiry: Date | null;
    google_email: string | null;
}
/** Conexão de uma empresa com um provedor (hoje só google_calendar). */
export interface IntegrationRepository {
    findByCompany(companyId: string): Promise<CompanyIntegration | null>;
    /** Cria a conexão ou substitui os tokens da existente (e limpa o "reconectar"). */
    saveConnection(companyId: string, data: ConnectionData): Promise<void>;
    markReconnectRequired(companyId: string, at: Date): Promise<void>;
    updateAccessToken(id: string, accessToken: string, tokenExpiry: Date | null): Promise<CompanyIntegration>;
    deleteByCompany(companyId: string): Promise<void>;
}
export declare class DrizzleIntegrationRepository implements IntegrationRepository {
    private readonly db;
    private readonly provider;
    constructor(db: DB, provider: string);
    findByCompany(companyId: string): Promise<CompanyIntegration | null>;
    saveConnection(companyId: string, data: ConnectionData): Promise<void>;
    markReconnectRequired(companyId: string, at: Date): Promise<void>;
    updateAccessToken(id: string, accessToken: string, tokenExpiry: Date | null): Promise<CompanyIntegration>;
    deleteByCompany(companyId: string): Promise<void>;
    private ofCompany;
}
//# sourceMappingURL=integracao.repository.d.ts.map