"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleApis = exports.GoogleAccessRevokedError = void 0;
const googleapis_1 = require("googleapis");
/**
 * O Google recusou os tokens da empresa: o acesso foi revogado, o token de
 * renovação venceu ou a permissão da agenda foi retirada. Só reconectando.
 */
class GoogleAccessRevokedError extends Error {
    constructor(cause) {
        super('Acesso ao Google revogado ou vencido', { cause });
        this.name = 'GoogleAccessRevokedError';
    }
    /** Erros da googleapis (gaxios) que significam "precisa reconectar". */
    static matches(err) {
        const e = err;
        if (e?.response?.status === 401)
            return true;
        if (e?.response?.data?.error === 'invalid_grant')
            return true;
        return /invalid_grant|insufficient.*(scope|permission)/i.test(e?.message ?? '');
    }
}
exports.GoogleAccessRevokedError = GoogleAccessRevokedError;
const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
];
const toDate = (ms) => (ms != null ? new Date(ms) : null);
/** Implementações com a biblioteca oficial `googleapis`. */
class GoogleApis {
    config;
    constructor(config) {
        this.config = config;
    }
    authUrl(state) {
        return this.client().generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            // Sempre pede consentimento: garante que o Google devolva refresh_token
            prompt: 'consent',
            state,
        });
    }
    async exchangeCode(code) {
        const oauth2 = this.client();
        const { tokens } = await oauth2.getToken(code);
        if (!tokens.access_token)
            throw new Error('Google não devolveu access_token');
        oauth2.setCredentials(tokens);
        const { data: userInfo } = await googleapis_1.google.oauth2({ version: 'v2', auth: oauth2 }).userinfo.get();
        return {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token ?? null,
            token_expiry: toDate(tokens.expiry_date),
            google_email: userInfo.email ?? null,
        };
    }
    refreshAccessToken(refreshToken) {
        return GoogleApis.detectRevoked(async () => {
            const oauth2 = this.client();
            oauth2.setCredentials({ refresh_token: refreshToken });
            const { credentials } = await oauth2.refreshAccessToken();
            if (!credentials.access_token)
                throw new Error('Google não devolveu access_token na renovação');
            return { access_token: credentials.access_token, token_expiry: toDate(credentials.expiry_date) };
        });
    }
    insert(credentials, event) {
        return GoogleApis.detectRevoked(async () => {
            const { data } = await this.calendar(credentials).events.insert({
                calendarId: 'primary',
                requestBody: GoogleApis.eventBody(event),
            });
            if (!data.id)
                throw new Error('Google não devolveu o id do evento');
            return data.id;
        });
    }
    update(credentials, eventId, event) {
        return GoogleApis.detectRevoked(async () => {
            await this.calendar(credentials).events.update({
                calendarId: 'primary',
                eventId,
                requestBody: GoogleApis.eventBody(event),
            });
        });
    }
    delete(credentials, eventId) {
        return GoogleApis.detectRevoked(async () => {
            await this.calendar(credentials).events.delete({ calendarId: 'primary', eventId });
        });
    }
    static async detectRevoked(call) {
        try {
            return await call();
        }
        catch (err) {
            if (GoogleAccessRevokedError.matches(err))
                throw new GoogleAccessRevokedError(err);
            throw err;
        }
    }
    client() {
        return new googleapis_1.google.auth.OAuth2(this.config.clientId, this.config.clientSecret, this.config.redirectUri);
    }
    calendar(credentials) {
        const oauth2 = this.client();
        oauth2.setCredentials(credentials);
        return googleapis_1.google.calendar({ version: 'v3', auth: oauth2 });
    }
    static eventBody(event) {
        return {
            summary: event.title,
            description: event.notes ?? undefined,
            start: { dateTime: event.start_at.toISOString() },
            end: { dateTime: event.end_at.toISOString() },
        };
    }
}
exports.GoogleApis = GoogleApis;
//# sourceMappingURL=google.gateways.js.map