import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { env } from './env';

export interface JwtPayload {
    sub: string;
    email: string;
    company_id: string | null;
    profile_tag: string;
    finance: boolean;
}

export function signAccessToken(payload: JwtPayload): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as any });
}

export function signRefreshToken(userId: string): string {
    // jti garante unicidade mesmo em logins consecutivos no mesmo segundo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return jwt.sign({ sub: userId, jti: randomUUID() }, env.REFRESH_SECRET, { expiresIn: env.REFRESH_EXPIRES_IN as any });
}

export function verifyAccessToken(token: string): JwtPayload | null {
    try {
        const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload & { purpose?: string };
        // Tokens de propósito específico (ex.: ticket do 2FA) NUNCA valem como access token
        if (payload.purpose) return null;
        return payload;
    } catch {
        return null;
    }
}

export function verifyRefreshToken(token: string): { sub: string } | null {
    try {
        return jwt.verify(token, env.REFRESH_SECRET) as { sub: string };
    } catch {
        return null;
    }
}

export function signTotpTicket(userId: string): string {
    return jwt.sign({ sub: userId, purpose: 'totp', jti: randomUUID() }, env.JWT_SECRET, { expiresIn: '5m' });
}

export function verifyTotpTicket(token: string): { sub: string; jti: string } | null {
    try {
        const p = jwt.verify(token, env.JWT_SECRET) as { sub: string; purpose?: string; jti?: string };
        if (p.purpose !== 'totp' || !p.jti) return null;
        return { sub: p.sub, jti: p.jti };
    } catch {
        return null;
    }
}

// Assina o parâmetro `state` do OAuth do Google Calendar como um ticket
// verificável, em vez de expor o company_id cru — sem isso, qualquer pessoa
// pode montar a URL de autorização do Google com state=<company_id alheio>
// e sequestrar a integração de outra empresa (CSRF no callback).
export function signOAuthStateTicket(companyId: string): string {
    return jwt.sign({ sub: companyId, purpose: 'google_oauth_state', jti: randomUUID() }, env.JWT_SECRET, { expiresIn: '10m' });
}

export function verifyOAuthStateTicket(token: string): { companyId: string } | null {
    try {
        const p = jwt.verify(token, env.JWT_SECRET) as { sub: string; purpose?: string };
        if (p.purpose !== 'google_oauth_state') return null;
        return { companyId: p.sub };
    } catch {
        return null;
    }
}
