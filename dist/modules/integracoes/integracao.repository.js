"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrizzleIntegrationRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const integracao_db_schema_1 = require("./integracao.db.schema");
class DrizzleIntegrationRepository {
    db;
    provider;
    constructor(db, provider) {
        this.db = db;
        this.provider = provider;
    }
    async findByCompany(companyId) {
        const [row] = await this.db
            .select()
            .from(integracao_db_schema_1.companyIntegrations)
            .where(this.ofCompany(companyId))
            .limit(1);
        return row ?? null;
    }
    async saveConnection(companyId, data) {
        const existing = await this.findByCompany(companyId);
        if (existing) {
            await this.db
                .update(integracao_db_schema_1.companyIntegrations)
                .set({ ...data, reconnect_required_at: null, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.id, existing.id));
        }
        else {
            await this.db
                .insert(integracao_db_schema_1.companyIntegrations)
                .values({ ...data, company_id: companyId, provider: this.provider });
        }
    }
    async markReconnectRequired(companyId, at) {
        await this.db
            .update(integracao_db_schema_1.companyIntegrations)
            .set({ reconnect_required_at: at, updated_at: new Date() })
            .where(this.ofCompany(companyId));
    }
    async updateAccessToken(id, accessToken, tokenExpiry) {
        const [row] = await this.db
            .update(integracao_db_schema_1.companyIntegrations)
            .set({ access_token: accessToken, token_expiry: tokenExpiry, updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.id, id))
            .returning();
        return row;
    }
    async deleteByCompany(companyId) {
        await this.db.delete(integracao_db_schema_1.companyIntegrations).where(this.ofCompany(companyId));
    }
    ofCompany(companyId) {
        return (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.company_id, companyId), (0, drizzle_orm_1.eq)(integracao_db_schema_1.companyIntegrations.provider, this.provider));
    }
}
exports.DrizzleIntegrationRepository = DrizzleIntegrationRepository;
//# sourceMappingURL=integracao.repository.js.map