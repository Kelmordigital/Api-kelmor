"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendaService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const agenda_db_schema_1 = require("./agenda.db.schema");
const integracao_service_1 = require("../integracoes/integracao.service");
const google_calendar_client_1 = require("../integracoes/google-calendar.client");
exports.agendaService = {
    async list(companyId, start, end) {
        return client_1.db
            .select()
            .from(agenda_db_schema_1.agendamentos)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.company_id, companyId), (0, drizzle_orm_1.between)(agenda_db_schema_1.agendamentos.start_at, start, end)));
    },
    async create(companyId, userId, payload) {
        const [row] = await client_1.db
            .insert(agenda_db_schema_1.agendamentos)
            .values({ ...payload, company_id: companyId, created_by: userId })
            .returning();
        const integration = await integracao_service_1.integracaoService.getValidTokens(companyId);
        if (integration) {
            try {
                const googleId = await (0, google_calendar_client_1.createCalendarEvent)(integration.access_token, integration.refresh_token, { title: row.title, start_at: row.start_at, end_at: row.end_at, notes: row.notes });
                const [updated] = await client_1.db
                    .update(agenda_db_schema_1.agendamentos)
                    .set({ google_event_id: googleId })
                    .where((0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.id, row.id))
                    .returning();
                return updated;
            }
            catch (err) {
                console.error('[agenda] Erro ao sincronizar com Google Calendar:', err);
            }
        }
        return row;
    },
    async update(id, companyId, payload) {
        const [row] = await client_1.db
            .update(agenda_db_schema_1.agendamentos)
            .set({ ...payload, updated_at: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.id, id), (0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.company_id, companyId)))
            .returning();
        if (!row)
            return null;
        if (row.google_event_id) {
            const integration = await integracao_service_1.integracaoService.getValidTokens(companyId);
            if (integration) {
                try {
                    await (0, google_calendar_client_1.updateCalendarEvent)(integration.access_token, integration.refresh_token, row.google_event_id, { title: row.title, start_at: row.start_at, end_at: row.end_at, notes: row.notes });
                }
                catch (err) {
                    console.error('[agenda] Erro ao atualizar evento no Google Calendar:', err);
                }
            }
        }
        return row;
    },
    async remove(id, companyId) {
        const [row] = await client_1.db
            .delete(agenda_db_schema_1.agendamentos)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.id, id), (0, drizzle_orm_1.eq)(agenda_db_schema_1.agendamentos.company_id, companyId)))
            .returning();
        if (!row)
            return false;
        if (row.google_event_id) {
            const integration = await integracao_service_1.integracaoService.getValidTokens(companyId);
            if (integration) {
                try {
                    await (0, google_calendar_client_1.deleteCalendarEvent)(integration.access_token, integration.refresh_token, row.google_event_id);
                }
                catch (err) {
                    console.error('[agenda] Erro ao deletar evento do Google Calendar:', err);
                }
            }
        }
        return true;
    },
};
//# sourceMappingURL=agenda.service.js.map