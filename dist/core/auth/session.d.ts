import type IORedis from 'ioredis';
/**
 * Chave da sessão ativa no Redis. O login grava, o middleware de autenticação
 * confere a cada requisição; sem a chave, o token deixa de valer na hora.
 */
export declare function sessionKey(profileTag: string, companyId: string | null, userId: string): string;
/** Derruba as sessões abertas de um usuário (o próximo acesso pede login de novo). */
export interface SessionRevoker {
    revoke(companyId: string | null, userId: string): Promise<void>;
}
export declare class RedisSessionRevoker implements SessionRevoker {
    private readonly redis;
    constructor(redis: () => IORedis | null);
    revoke(companyId: string | null, userId: string): Promise<void>;
}
/** Abre (e revoga) a sessão ativa de um usuário. */
export interface SessionStore extends SessionRevoker {
    open(profileTag: string, companyId: string | null, userId: string, ttlSeconds: number): Promise<void>;
}
export declare class RedisSessionStore extends RedisSessionRevoker implements SessionStore {
    private readonly client;
    constructor(client: () => IORedis | null);
    open(profileTag: string, companyId: string | null, userId: string, ttlSeconds: number): Promise<void>;
}
//# sourceMappingURL=session.d.ts.map