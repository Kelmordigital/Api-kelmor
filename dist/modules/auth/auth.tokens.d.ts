import { type JwtPayload } from '../../config/jwt';
/** Emissão e conferência dos tokens de sessão e do "ticket" do 2FA. */
export interface TokenService {
    access(payload: JwtPayload): string;
    refresh(userId: string): string;
    /** Dono do refresh token, ou null se inválido/expirado. */
    verifyRefresh(token: string): {
        sub: string;
    } | null;
    totpTicket(userId: string): string;
    verifyTotpTicket(ticket: string): {
        sub: string;
        jti: string;
    } | null;
}
export declare class JwtTokenService implements TokenService {
    access(payload: JwtPayload): string;
    refresh(userId: string): string;
    verifyRefresh(token: string): {
        sub: string;
    } | null;
    totpTicket(userId: string): string;
    verifyTotpTicket(ticket: string): {
        sub: string;
        jti: string;
    } | null;
}
//# sourceMappingURL=auth.tokens.d.ts.map