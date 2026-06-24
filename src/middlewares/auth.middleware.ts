import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../config/jwt';
import { getRedisClient } from '../config/redis';

declare module 'fastify' {
    interface FastifyRequest {
        user: {
            id: string;
            email: string;
            company_id: string | null;
            profile_tag: string;
            finance: boolean;
        };
    }
}

function sessionKey(profileTag: string, companyId: string | null, userId: string): string {
    return profileTag === 'superAdmin'
        ? `superadmin-${userId}`
        : `company-${companyId}-user-${userId}`;
}

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token não fornecido' });
    }
    const payload = verifyAccessToken(authHeader.split(' ')[1]);
    if (!payload) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token inválido ou expirado' });
    }

    const redis = getRedisClient();
    if (redis) {
        const key = sessionKey(payload.profile_tag, payload.company_id, payload.sub);
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
