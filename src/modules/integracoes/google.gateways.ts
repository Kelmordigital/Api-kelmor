import { google } from 'googleapis';

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
export class GoogleAccessRevokedError extends Error {
    constructor(cause: unknown) {
        super('Acesso ao Google revogado ou vencido', { cause });
        this.name = 'GoogleAccessRevokedError';
    }

    /** Erros da googleapis (gaxios) que significam "precisa reconectar". */
    static matches(err: unknown): boolean {
        const e = err as { message?: string; response?: { status?: number; data?: { error?: unknown } } } | null;
        if (e?.response?.status === 401) return true;
        if (e?.response?.data?.error === 'invalid_grant') return true;
        return /invalid_grant|insufficient.*(scope|permission)/i.test(e?.message ?? '');
    }
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

const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
];

const toDate = (ms: number | null | undefined) => (ms != null ? new Date(ms) : null);

/** Implementações com a biblioteca oficial `googleapis`. */
export class GoogleApis implements GoogleOAuthGateway, CalendarEventsGateway {
    constructor(private readonly config: GoogleOAuthConfig) {}

    authUrl(state: string): string {
        return this.client().generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            // Sempre pede consentimento: garante que o Google devolva refresh_token
            prompt: 'consent',
            state,
        });
    }

    async exchangeCode(code: string): Promise<GoogleTokens> {
        const oauth2 = this.client();
        const { tokens } = await oauth2.getToken(code);
        if (!tokens.access_token) throw new Error('Google não devolveu access_token');
        oauth2.setCredentials(tokens);

        const { data: userInfo } = await google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get();
        return {
            access_token:  tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            token_expiry:  toDate(tokens.expiry_date),
            google_email:  userInfo.email ?? null,
        };
    }

    refreshAccessToken(refreshToken: string): Promise<RefreshedAccessToken> {
        return GoogleApis.detectRevoked(async () => {
            const oauth2 = this.client();
            oauth2.setCredentials({ refresh_token: refreshToken });
            const { credentials } = await oauth2.refreshAccessToken();
            if (!credentials.access_token) throw new Error('Google não devolveu access_token na renovação');
            return { access_token: credentials.access_token, token_expiry: toDate(credentials.expiry_date) };
        });
    }

    insert(credentials: GoogleCredentials, event: CalendarEvent): Promise<string> {
        return GoogleApis.detectRevoked(async () => {
            const { data } = await this.calendar(credentials).events.insert({
                calendarId: 'primary',
                requestBody: GoogleApis.eventBody(event),
            });
            if (!data.id) throw new Error('Google não devolveu o id do evento');
            return data.id;
        });
    }

    update(credentials: GoogleCredentials, eventId: string, event: CalendarEvent): Promise<void> {
        return GoogleApis.detectRevoked(async () => {
            await this.calendar(credentials).events.update({
                calendarId: 'primary',
                eventId,
                requestBody: GoogleApis.eventBody(event),
            });
        });
    }

    delete(credentials: GoogleCredentials, eventId: string): Promise<void> {
        return GoogleApis.detectRevoked(async () => {
            await this.calendar(credentials).events.delete({ calendarId: 'primary', eventId });
        });
    }

    private static async detectRevoked<T>(call: () => Promise<T>): Promise<T> {
        try {
            return await call();
        } catch (err) {
            if (GoogleAccessRevokedError.matches(err)) throw new GoogleAccessRevokedError(err);
            throw err;
        }
    }

    private client() {
        return new google.auth.OAuth2(this.config.clientId, this.config.clientSecret, this.config.redirectUri);
    }

    private calendar(credentials: GoogleCredentials) {
        const oauth2 = this.client();
        oauth2.setCredentials(credentials);
        return google.calendar({ version: 'v3', auth: oauth2 });
    }

    private static eventBody(event: CalendarEvent) {
        return {
            summary:     event.title,
            description: event.notes ?? undefined,
            start: { dateTime: event.start_at.toISOString() },
            end:   { dateTime: event.end_at.toISOString() },
        };
    }
}
