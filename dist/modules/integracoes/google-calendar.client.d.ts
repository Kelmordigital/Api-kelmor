export declare function getAuthUrlWithState(state: string): string;
export declare function exchangeCode(code: string): Promise<{
    access_token: string;
    refresh_token: string;
    token_expiry: Date;
    google_email: string;
}>;
export declare function refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    token_expiry: Date;
}>;
export declare function createCalendarEvent(accessToken: string, refreshToken: string, event: {
    title: string;
    start_at: Date;
    end_at: Date;
    notes?: string | null;
}): Promise<string>;
export declare function updateCalendarEvent(accessToken: string, refreshToken: string, googleEventId: string, event: {
    title: string;
    start_at: Date;
    end_at: Date;
    notes?: string | null;
}): Promise<void>;
export declare function deleteCalendarEvent(accessToken: string, refreshToken: string, googleEventId: string): Promise<void>;
//# sourceMappingURL=google-calendar.client.d.ts.map