import { eq, and } from 'drizzle-orm';
import type { DB } from '../../database/client';
import { companyIntegrations, CompanyIntegration } from './integracao.db.schema';

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

export class DrizzleIntegrationRepository implements IntegrationRepository {
    constructor(
        private readonly db: DB,
        private readonly provider: string,
    ) {}

    async findByCompany(companyId: string): Promise<CompanyIntegration | null> {
        const [row] = await this.db
            .select()
            .from(companyIntegrations)
            .where(this.ofCompany(companyId))
            .limit(1);
        return row ?? null;
    }

    async saveConnection(companyId: string, data: ConnectionData): Promise<void> {
        const existing = await this.findByCompany(companyId);
        if (existing) {
            await this.db
                .update(companyIntegrations)
                .set({ ...data, reconnect_required_at: null, updated_at: new Date() })
                .where(eq(companyIntegrations.id, existing.id));
        } else {
            await this.db
                .insert(companyIntegrations)
                .values({ ...data, company_id: companyId, provider: this.provider });
        }
    }

    async markReconnectRequired(companyId: string, at: Date): Promise<void> {
        await this.db
            .update(companyIntegrations)
            .set({ reconnect_required_at: at, updated_at: new Date() })
            .where(this.ofCompany(companyId));
    }

    async updateAccessToken(id: string, accessToken: string, tokenExpiry: Date | null): Promise<CompanyIntegration> {
        const [row] = await this.db
            .update(companyIntegrations)
            .set({ access_token: accessToken, token_expiry: tokenExpiry, updated_at: new Date() })
            .where(eq(companyIntegrations.id, id))
            .returning();
        return row;
    }

    async deleteByCompany(companyId: string): Promise<void> {
        await this.db.delete(companyIntegrations).where(this.ofCompany(companyId));
    }

    private ofCompany(companyId: string) {
        return and(eq(companyIntegrations.company_id, companyId), eq(companyIntegrations.provider, this.provider));
    }
}
