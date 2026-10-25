import { type CalendarEvent, type CalendarEventsGateway } from './google.gateways';
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
export declare class GoogleCalendarSync implements CalendarSync {
    private readonly credentials;
    private readonly events;
    constructor(credentials: GoogleCredentialsProvider, events: CalendarEventsGateway);
    createEvent(companyId: string, event: CalendarEvent): Promise<string | null>;
    updateEvent(companyId: string, eventId: string, event: CalendarEvent): Promise<void>;
    deleteEvent(companyId: string, eventId: string): Promise<void>;
    private attempt;
}
//# sourceMappingURL=calendar-sync.d.ts.map