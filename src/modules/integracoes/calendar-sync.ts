import { GoogleAccessRevokedError, type CalendarEvent, type CalendarEventsGateway, type GoogleCredentials } from './google.gateways';
import type { GoogleCredentialsProvider } from './integracao.service';

export type { CalendarEvent } from './google.gateways';

/**
 * Espelha eventos internos (ex.: agendamentos) na agenda externa da empresa.
 * Sincronizar é "melhor esforço": nunca lança erro. Se a empresa não tem
 * integração ou o provedor falha, o evento interno segue valendo. Se o
 * provedor recusar o acesso, a integração fica marcada para reconectar.
 */
export interface CalendarSync {
    /** Id do evento externo, ou null se não sincronizou. */
    createEvent(companyId: string, event: CalendarEvent): Promise<string | null>;
    updateEvent(companyId: string, eventId: string, event: CalendarEvent): Promise<void>;
    deleteEvent(companyId: string, eventId: string): Promise<void>;
}

export class GoogleCalendarSync implements CalendarSync {
    constructor(
        private readonly credentials: GoogleCredentialsProvider,
        private readonly events: CalendarEventsGateway,
    ) {}

    createEvent(companyId: string, event: CalendarEvent): Promise<string | null> {
        return this.attempt('criar', companyId, (c) => this.events.insert(c, event));
    }

    async updateEvent(companyId: string, eventId: string, event: CalendarEvent): Promise<void> {
        await this.attempt('atualizar', companyId, (c) => this.events.update(c, eventId, event));
    }

    async deleteEvent(companyId: string, eventId: string): Promise<void> {
        await this.attempt('apagar', companyId, (c) => this.events.delete(c, eventId));
    }

    private async attempt<T>(action: string, companyId: string, call: (c: GoogleCredentials) => Promise<T>): Promise<T | null> {
        try {
            const credentials = await this.credentials.validCredentials(companyId);
            if (!credentials) return null;
            return await call(credentials);
        } catch (err) {
            if (err instanceof GoogleAccessRevokedError) {
                await this.credentials.reportAccessRevoked(companyId).catch((e) => console.error('[google-calendar]', e));
                return null;
            }
            console.error(`[google-calendar] Erro ao ${action} evento (empresa ${companyId}):`, err);
            return null;
        }
    }
}
