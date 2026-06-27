import { eq, and } from 'drizzle-orm';
import { db } from '../../database/client';
import { companyIntegrations, CompanyIntegration } from './integracao.db.schema';
import { exchangeCode, refreshAccessToken } from './google-calendar.client';

export const integracaoService = {

    async handleCallback(companyId: string, code: string): Promise<void> {
        const tokens = await exchangeCode(code);

        const [existing] = await db
            .select()
            .from(companyIntegrations)
            .where(
                and(
                    eq(companyIntegrations.company_id, companyId),
                    eq(companyIntegrations.provider, 'google_calendar'),
                ),
            )
            .limit(1);

        if (existing) {
            await db
                .update(companyIntegrations)
                .set({
                    access_token:  tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    token_expiry:  tokens.token_expiry,
                    google_email:  tokens.google_email,
                    updated_at:    new Date(),
                })
                .where(eq(companyIntegrations.id, existing.id));
        } else {
            await db.insert(companyIntegrations).values({
                company_id:    companyId,
                provider:      'google_calendar',
                access_token:  tokens.access_token,
                refresh_token: tokens.refresh_token,
                token_expiry:  tokens.token_expiry,
                google_email:  tokens.google_email,
            });
        }
    },

    async getStatus(companyId: string): Promise<{ connected: boolean; email?: string }> {
        const [row] = await db
            .select()
            .from(companyIntegrations)
            .where(
                and(
                    eq(companyIntegrations.company_id, companyId),
                    eq(companyIntegrations.provider, 'google_calendar'),
                ),
            )
            .limit(1);

        if (!row) return { connected: false };
        return { connected: true, email: row.google_email ?? undefined };
    },

    async disconnect(companyId: string): Promise<void> {
        await db
            .delete(companyIntegrations)
            .where(
                and(
                    eq(companyIntegrations.company_id, companyId),
                    eq(companyIntegrations.provider, 'google_calendar'),
                ),
            );
    },

    async getValidTokens(companyId: string): Promise<CompanyIntegration | null> {
        const [row] = await db
            .select()
            .from(companyIntegrations)
            .where(
                and(
                    eq(companyIntegrations.company_id, companyId),
                    eq(companyIntegrations.provider, 'google_calendar'),
                ),
            )
            .limit(1);

        if (!row) return null;

        const isExpired = row.token_expiry && row.token_expiry < new Date();
        if (isExpired) {
            const refreshed = await refreshAccessToken(row.refresh_token);
            const [updated] = await db
                .update(companyIntegrations)
                .set({
                    access_token: refreshed.access_token,
                    token_expiry: refreshed.token_expiry,
                    updated_at:   new Date(),
                })
                .where(eq(companyIntegrations.id, row.id))
                .returning();
            return updated;
        }

        return row;
    },
};
