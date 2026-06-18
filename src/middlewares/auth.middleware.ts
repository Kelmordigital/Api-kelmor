import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../config/jwt';

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

export async function authMiddleware(req: FastifyRequest, reply: FastifyReply) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token não fornecido' });
    }
    const payload = verifyAccessToken(authHeader.split(' ')[1]);
    if (!payload) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token inválido ou expirado' });
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
