"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarSync = void 0;
const google_gateways_1 = require("./google.gateways");
class GoogleCalendarSync {
    credentials;
    events;
    constructor(credentials, events) {
        this.credentials = credentials;
        this.events = events;
    }
    createEvent(companyId, event) {
        return this.attempt('criar', companyId, (c) => this.events.insert(c, event));
    }
    async updateEvent(companyId, eventId, event) {
        await this.attempt('atualizar', companyId, (c) => this.events.update(c, eventId, event));
    }
    async deleteEvent(companyId, eventId) {
        await this.attempt('apagar', companyId, (c) => this.events.delete(c, eventId));
    }
    async attempt(action, companyId, call) {
        try {
            const credentials = await this.credentials.validCredentials(companyId);
            if (!credentials)
                return null;
            return await call(credentials);
        }
        catch (err) {
            if (err instanceof google_gateways_1.GoogleAccessRevokedError) {
                await this.credentials.reportAccessRevoked(companyId).catch((e) => console.error('[google-calendar]', e));
                return null;
            }
            console.error(`[google-calendar] Erro ao ${action} evento (empresa ${companyId}):`, err);
            return null;
        }
    }
}
exports.GoogleCalendarSync = GoogleCalendarSync;
//# sourceMappingURL=calendar-sync.js.map