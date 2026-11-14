import type Redis from 'ioredis';
import type { JwtPayload } from '../../config/jwt';
import { sessionKey } from './session';

/** Quem está logado, segundo o token de acesso. */
export interface AuthUser {
    id: string;
    email: string;
    company_id: string | null;
    profile_tag: string;
    finance: boolean;
}

export type AccessCheck =
    | { ok: true; user: AuthUser }
    | { ok: false; reason: 'missing' | 'invalid' | 'session' };

/**
 * Confere um token de acesso: assinatura e validade (JWT) e, com Redis
 * disponível, se a sessão ainda existe no servidor (logout, revogação e
 * empresa desativada apagam a sessão). Usado pelas rotas e pelo socket.
 */
export class AccessTokenVerifier {
    constructor(
        private readonly verify: (token: string) => JwtPayload | null,
        private readonly redis: () => Redis | null,
    ) {}

    async check(token: string | undefined): Promise<AccessCheck> {
        if (!token) return { ok: false, reason: 'missing' };
        const payload = this.verify(token);
        if (!payload) return { ok: false, reason: 'invalid' };

        const redis = this.redis();
        if (redis && !await redis.get(sessionKey(payload.profile_tag, payload.company_id, payload.sub))) {
            return { ok: false, reason: 'session' };
        }
        return {
            ok: true,
            user: { id: payload.sub, email: payload.email, company_id: payload.company_id, profile_tag: payload.profile_tag, finance: payload.finance },
        };
    }
}
