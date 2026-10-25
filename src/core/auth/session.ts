import type IORedis from 'ioredis';

/**
 * Chave da sessão ativa no Redis. O login grava, o middleware de autenticação
 * confere a cada requisição; sem a chave, o token deixa de valer na hora.
 */
export function sessionKey(profileTag: string, companyId: string | null, userId: string): string {
    return profileTag === 'superAdmin'
        ? `superadmin-${userId}`
        : `company-${companyId}-user-${userId}`;
}

/** Derruba as sessões abertas de um usuário (o próximo acesso pede login de novo). */
export interface SessionRevoker {
    revoke(companyId: string | null, userId: string): Promise<void>;
}

export class RedisSessionRevoker implements SessionRevoker {
    constructor(private readonly redis: () => IORedis | null) {}

    async revoke(companyId: string | null, userId: string): Promise<void> {
        const redis = this.redis();
        if (!redis) return;
        // Remove as duas formas de chave: o perfil pode ter acabado de mudar
        await redis.del(sessionKey('user', companyId, userId), sessionKey('superAdmin', companyId, userId));
    }
}

/** Abre (e revoga) a sessão ativa de um usuário. */
export interface SessionStore extends SessionRevoker {
    open(profileTag: string, companyId: string | null, userId: string, ttlSeconds: number): Promise<void>;
}

export class RedisSessionStore extends RedisSessionRevoker implements SessionStore {
    constructor(private readonly client: () => IORedis | null) {
        super(client);
    }

    async open(profileTag: string, companyId: string | null, userId: string, ttlSeconds: number): Promise<void> {
        const redis = this.client();
        if (!redis) return;
        await redis.set(sessionKey(profileTag, companyId, userId), userId, 'EX', ttlSeconds);
    }
}
