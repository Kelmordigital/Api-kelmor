import { google } from 'googleapis';
import { env } from '../../config/env';

const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
];

function createOAuth2Client() {
    return new google.auth.OAuth2(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI,
    );
}

export function getAuthUrlWithState(state: string): string {
    const oauth2 = createOAuth2Client();
    return oauth2.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state,
    });
}

export async function exchangeCode(code: string): Promise<{
    access_token: string;
    refresh_token: string;
    token_expiry: Date;
    google_email: string;
}> {
    const oauth2 = createOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const { data: userInfo } = await oauth2Api.userinfo.get();

    return {
        access_token:  tokens.access_token!,
        refresh_token: tokens.refresh_token!,
        token_expiry:  new Date(tokens.expiry_date!),
        google_email:  userInfo.email!,
    };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    token_expiry: Date;
}> {
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await oauth2.refreshAccessToken();
    return {
        access_token: credentials.access_token!,
        token_expiry: new Date(credentials.expiry_date!),
    };
}

export async function createCalendarEvent(
    accessToken: string,
    refreshToken: string,
    event: { title: string; start_at: Date; end_at: Date; notes?: string | null },
): Promise<string> {
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    const { data } = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary:     event.title,
            description: event.notes ?? undefined,
            start: { dateTime: event.start_at.toISOString() },
            end:   { dateTime: event.end_at.toISOString() },
        },
    });

    return data.id!;
}

export async function updateCalendarEvent(
    accessToken: string,
    refreshToken: string,
    googleEventId: string,
    event: { title: string; start_at: Date; end_at: Date; notes?: string | null },
): Promise<void> {
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    await calendar.events.update({
        calendarId: 'primary',
        eventId: googleEventId,
        requestBody: {
            summary:     event.title,
            description: event.notes ?? undefined,
            start: { dateTime: event.start_at.toISOString() },
            end:   { dateTime: event.end_at.toISOString() },
        },
    });
}

export async function deleteCalendarEvent(
    accessToken: string,
    refreshToken: string,
    googleEventId: string,
): Promise<void> {
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    await calendar.events.delete({
        calendarId: 'primary',
        eventId: googleEventId,
    });
}
