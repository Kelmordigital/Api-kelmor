export interface GoogleCredentials {
    access_token: string;
    refresh_token: string;
}
/** O que o Google devolve ao trocar o code. refresh_token pode faltar em reconexões. */
export interface GoogleTokens {
    access_token: string;
    refresh_token: string | null;
    token_expiry: Date | null;
    google_email: string | null;
}
export interface RefreshedAccessToken {
    access_token: string;
    token_expiry: Date | null;
}
/**
 * O Google recusou os tokens da empresa: o acesso foi revogado, o token de
 * renovação venceu ou a permissão da agenda foi retirada. Só reconectando.
 */
export declare class GoogleAccessRevokedError extends Error {
    constructor(cause: unknown);
    /** Erros da googleapis (gaxios) que significam "precisa reconectar". */
    static matches(err: unknown): boolean;
}
export interface CalendarEvent {
    title: string;
    start_at: Date;
    end_at: Date;
    notes?: string | null;
}
/** Fluxo OAuth do Google. */
export interface GoogleOAuthGateway {
    authUrl(state: string): string;
    exchangeCode(code: string): Promise<GoogleTokens>;
    /** Lança GoogleAccessRevokedError se o Google recusar o refresh token. */
    refreshAccessToken(refreshToken: string): Promise<RefreshedAccessToken>;
}
/** Eventos na agenda principal da conta conectada. Lançam GoogleAccessRevokedError se o acesso caiu. */
export interface CalendarEventsGateway {
    insert(credentials: GoogleCredentials, event: CalendarEvent): Promise<string>;
    update(credentials: GoogleCredentials, eventId: string, event: CalendarEvent): Promise<void>;
    delete(credentials: GoogleCredentials, eventId: string): Promise<void>;
}
export interface GoogleOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}
/** Implementações com a biblioteca oficial `googleapis`. */
export declare class GoogleApis implements GoogleOAuthGateway, CalendarEventsGateway {
    private readonly config;
    constructor(config: GoogleOAuthConfig);
    authUrl(state: string): string;
    exchangeCode(code: string): Promise<GoogleTokens>;
    refreshAccessToken(refreshToken: string): Promise<RefreshedAccessToken>;
    insert(credentials: GoogleCredentials, event: CalendarEvent): Promise<string>;
    update(credentials: GoogleCredentials, eventId: string, event: CalendarEvent): Promise<void>;
    delete(credentials: GoogleCredentials, eventId: string): Promise<void>;
    private static detectRevoked;
    private client;
    private calendar;
    private static eventBody;
}
//# sourceMappingURL=google.gateways.d.ts.map