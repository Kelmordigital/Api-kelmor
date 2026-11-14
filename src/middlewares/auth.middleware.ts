import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../config/jwt';
import { getRedisClient } from '../config/redis';
import { AccessTokenVerifier, type AuthUser } from '../core/auth/access-token';

declare module 'fastify' {
    interface FastifyRequest {
        user: AuthUser;
    }
}

/** Verificação do token de acesso, compartilhada pelas rotas e pelo socket. */
export const accessTokens = new AccessTokenVerifier(verifyAccessToken, getRedisClient);

const REJECTION = {
    missing: 'Token não fornecido',
    invalid: 'Token inválido ou expirado',
    session: 'Sessão expirada. Faça login novamente.',
} as const;

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    const check = await accessTokens.check(token);
    if (!check.ok) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: REJECTION[check.reason] });
    }
    req.user = check.user;
}

export async function adminMiddleware(req: FastifyRequest, reply: FastifyReply) {
    const { env } = await import('../config/env');
    const key = req.headers['x-admin-key'];
    if (!key || key !== env.ADMIN_SECRET) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Chave de admin inválida' });
    }
}

export async function requireSuperAdmin(req: FastifyRequest, reply: FastifyReply) {
    if (req.user.profile_tag !== 'superAdmin') {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Acesso exclusivo para o administrador do sistema.' });
    }
}

export async function requireFinance(req: FastifyRequest, reply: FastifyReply) {
    if (req.user.profile_tag !== 'superAdmin' && !req.user.finance) {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Acesso negado! Apenas usuários financeiros podem alterar configurações de módulos.' });
    }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
    if (req.user.profile_tag !== 'admin' && req.user.profile_tag !== 'superAdmin') {
        return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Acesso exclusivo para administradores.' });
    }
}
