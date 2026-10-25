"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.adminMiddleware = adminMiddleware;
exports.requireSuperAdmin = requireSuperAdmin;
exports.requireFinance = requireFinance;
exports.requireAdmin = requireAdmin;
const jwt_1 = require("../config/jwt");
const redis_1 = require("../config/redis");
const session_1 = require("../core/auth/session");
async function authMiddleware(req, reply) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token não fornecido' });
    }
    const payload = (0, jwt_1.verifyAccessToken)(authHeader.split(' ')[1]);
    if (!payload) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token inválido ou expirado' });
    }
    const redis = (0, redis_1.getRedisClient)();
    if (redis) {
        const key = (0, session_1.sessionKey)(payload.profile_tag, payload.company_id, payload.sub);
        const session = await redis.get(key);
        if (!session) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão expirada. Faça login novamente.' });
        }
    }
    req.user = {
        id: payload.sub,
        email: payload.email,
        company_id: payload.company_id,
        profile_tag: payload.profile_tag,
        finance: payload.finance,
    };
}
async function adminMiddleware(req, reply) {
    const { env } = await Promise.resolve().then(() => __importStar(require('../config/env')));
    const key = req.headers['x-admin-key'];
    if (!key || key !== env.ADMIN_SECRET) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Chave de admin inválida' });
    }
}
async function requireSuperAdmin(req, reply) {
    if (req.user.profile_tag !== 'superAdmin') {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Acesso exclusivo para o administrador do sistema.' });
    }
}
async function requireFinance(req, reply) {
    if (req.user.profile_tag !== 'superAdmin' && !req.user.finance) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Acesso negado! Apenas usuários financeiros podem alterar configurações de módulos.' });
    }
}
async function requireAdmin(req, reply) {
    if (req.user.profile_tag !== 'admin' && req.user.profile_tag !== 'superAdmin') {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Acesso exclusivo para administradores.' });
    }
}
//# sourceMappingURL=auth.middleware.js.map