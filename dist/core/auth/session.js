"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisSessionStore = exports.RedisSessionRevoker = void 0;
exports.sessionKey = sessionKey;
/**
 * Chave da sessão ativa no Redis. O login grava, o middleware de autenticação
 * confere a cada requisição; sem a chave, o token deixa de valer na hora.
 */
function sessionKey(profileTag, companyId, userId) {
    return profileTag === 'superAdmin'
        ? `superadmin-${userId}`
        : `company-${companyId}-user-${userId}`;
}
class RedisSessionRevoker {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    async revoke(companyId, userId) {
        const redis = this.redis();
        if (!redis)
            return;
        // Remove as duas formas de chave: o perfil pode ter acabado de mudar
        await redis.del(sessionKey('user', companyId, userId), sessionKey('superAdmin', companyId, userId));
    }
}
exports.RedisSessionRevoker = RedisSessionRevoker;
class RedisSessionStore extends RedisSessionRevoker {
    client;
    constructor(client) {
        super(client);
        this.client = client;
    }
    async open(profileTag, companyId, userId, ttlSeconds) {
        const redis = this.client();
        if (!redis)
            return;
        await redis.set(sessionKey(profileTag, companyId, userId), userId, 'EX', ttlSeconds);
    }
}
exports.RedisSessionStore = RedisSessionStore;
//# sourceMappingURL=session.js.map