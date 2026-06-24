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
        return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
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
