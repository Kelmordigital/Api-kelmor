"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthUrlWithState = getAuthUrlWithState;
exports.exchangeCode = exchangeCode;
exports.refreshAccessToken = refreshAccessToken;
exports.createCalendarEvent = createCalendarEvent;
exports.updateCalendarEvent = updateCalendarEvent;
exports.deleteCalendarEvent = deleteCalendarEvent;
const googleapis_1 = require("googleapis");
const env_1 = require("../../config/env");
const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
];
function createOAuth2Client() {
    return new googleapis_1.google.auth.OAuth2(env_1.env.GOOGLE_CLIENT_ID, env_1.env.GOOGLE_CLIENT_SECRET, env_1.env.GOOGLE_REDIRECT_URI);
}
function getAuthUrlWithState(state) {
    const oauth2 = createOAuth2Client();
    return oauth2.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state,
    });
}
async function exchangeCode(code) {
    const oauth2 = createOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);
    const oauth2Api = googleapis_1.google.oauth2({ version: 'v2', auth: oauth2 });
    const { data: userInfo } = await oauth2Api.userinfo.get();
    return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: new Date(tokens.expiry_date),
        google_email: userInfo.email,
    };
}
async function refreshAccessToken(refreshToken) {
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2.refreshAccessToken();
    return {
        access_token: credentials.access_token,
        token_expiry: new Date(credentials.expiry_date),
    };
}
async function createCalendarEvent(accessToken, refreshToken, event) {
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth2 });
    const { data } = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: event.title,
            description: event.notes ?? undefined,
            start: { dateTime: event.start_at.toISOString() },
            end: { dateTime: event.end_at.toISOString() },
        },
    });
    return data.id;
}
async function updateCalendarEvent(accessToken, refreshToken, googleEventId, event) {
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth2 });
    await calendar.events.update({
        calendarId: 'primary',
        eventId: googleEventId,
        requestBody: {
            summary: event.title,
            description: event.notes ?? undefined,
            start: { dateTime: event.start_at.toISOString() },
            end: { dateTime: event.end_at.toISOString() },
        },
    });
}
async function deleteCalendarEvent(accessToken, refreshToken, googleEventId) {
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth2 });
    await calendar.events.delete({
        calendarId: 'primary',
        eventId: googleEventId,
    });
}
//# sourceMappingURL=google-calendar.client.js.map