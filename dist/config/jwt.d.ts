export interface JwtPayload {
    sub: string;
    email: string;
    company_id: string | null;
    profile_tag: string;
    finance: boolean;
}
export declare function signAccessToken(payload: JwtPayload): string;
export declare function signRefreshToken(userId: string): string;
export declare function verifyAccessToken(token: string): JwtPayload | null;
export declare function verifyRefreshToken(token: string): {
    sub: string;
} | null;
export declare function signTotpTicket(userId: string): string;
export declare function verifyTotpTicket(token: string): {
    sub: string;
    jti: string;
} | null;
//# sourceMappingURL=jwt.d.ts.map