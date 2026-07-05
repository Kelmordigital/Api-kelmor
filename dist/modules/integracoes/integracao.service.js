"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integracaoService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const integracao_db_schema_1 = require("./integracao.db.schema");
const google_calendar_client_1 = require("./google-calendar.client");
exports.integracaoService = {
    async handleCallback(companyId, code) {
        const tokens = await (0, google_calendar_client_1.exchangeCode)(code);
        const [existing] = await client_1.db
            .select()
            .from(integracao_db_schema_1.companyIntegrations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.company_id, companyId), (0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.provider, 'google_calendar')))
            .limit(1);
        if (existing) {
            await client_1.db
                .update(integracao_db_schema_1.companyIntegrations)
                .set({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                token_expiry: tokens.token_expiry,
                google_email: tokens.google_email,
                updated_at: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.id, existing.id));
        }
        else {
            await client_1.db.insert(integracao_db_schema_1.companyIntegrations).values({
                company_id: companyId,
                provider: 'google_calendar',
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                token_expiry: tokens.token_expiry,
                google_email: tokens.google_email,
            });
        }
    },
    async getStatus(companyId) {
        const [row] = await client_1.db
            .select()
            .from(integracao_db_schema_1.companyIntegrations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.company_id, companyId), (0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.provider, 'google_calendar')))
            .limit(1);
        if (!row)
            return { connected: false };
        return { connected: true, email: row.google_email ?? undefined };
    },
    async disconnect(companyId) {
        await client_1.db
            .delete(integracao_db_schema_1.companyIntegrations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.company_id, companyId), (0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.provider, 'google_calendar')));
    },
    async getValidTokens(companyId) {
        const [row] = await client_1.db
            .select()
            .from(integracao_db_schema_1.companyIntegrations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.company_id, companyId), (0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.provider, 'google_calendar')))
            .limit(1);
        if (!row)
            return null;
        const isExpired = row.token_expiry && row.token_expiry < new Date();
        if (isExpired) {
            const refreshed = await (0, google_calendar_client_1.refreshAccessToken)(row.refresh_token);
            const [updated] = await client_1.db
                .update(integracao_db_schema_1.companyIntegrations)
                .set({
                access_token: refreshed.access_token,
                token_expiry: refreshed.token_expiry,
                updated_at: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.id, row.id))
                .returning();
            return updated;
        }
        return row;
    },
};
//# sourceMappingURL=integracao.service.js.map