import { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authRepository } from './auth.repository';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../config/jwt';
import { getRedisClient } from '../../config/redis';

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    profile_id: z.number().int().min(1).max(3),
    company_id: z.string().uuid().nullable().optional(),
});

function refreshExpiresAt(): Date {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

function redisSessionKey(profileTag: string, companyId: string | null, userId: string): string {
    return profileTag === 'superAdmin'
        ? `superadmin-${userId}`
        : `company-${companyId}-user-${userId}`;
}

export const authController = {
    async login(req: FastifyRequest, reply: FastifyReply) {
        const { email, password } = loginSchema.parse(req.body);

        // Passo 1+2: credenciais
        const user = await authRepository.findByEmailWithProfile(email);
        if (!user) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Usuário ou senha inválido' });
        }
        const validPwd = await bcrypt.compare(password, user.password_hash);
        if (!validPwd) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Usuário ou senha inválido' });
        }

        // Passo 3: email verificado
        if (!user.email_verified) {
            return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Email não verificado' });
        }

        // Passo 4: aprovado
        if (!user.is_approved) {
            return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Sua conta está aguardando aprovação.' });
        }

        // Passos 5+6: empresa (superAdmin pula)
        if (user.profile_tag !== 'superAdmin') {
            if (!user.company_id) {
                return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Sua conta está indisponível no momento. Entre em contato com o financeiro.' });
            }
            const company = await authRepository.findCompanyById(user.company_id);
            if (!company?.status) {
                return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Empresa inativa' });
            }
        }

        // Passo 7: emitir tokens
        const accessToken = signAccessToken({
            sub: user.id,
            email: user.email,
            company_id: user.company_id,
            profile_tag: user.profile_tag,
            finance: user.finance,
        });
        const refreshToken = signRefreshToken(user.id);
        await authRepository.saveRefreshToken(user.id, refreshToken, refreshExpiresAt());

        // Sessão Redis
        const redis = getRedisClient();
        if (redis) {
            const key = redisSessionKey(user.profile_tag, user.company_id, user.id);
            await redis.set(key, user.id, 'EX', 7 * 24 * 60 * 60);
        }

        reply.setCookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/v1/auth/refresh',
            maxAge: 60 * 60 * 24 * 7,
        });

        return reply.send({
            access_token: accessToken,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                profile_tag: user.profile_tag,
                company_id: user.company_id,
                finance: user.finance,
            },
        });
    },

    async me(req: FastifyRequest, reply: FastifyReply) {
        const user = await authRepository.findByIdWithProfile(req.user.id);
        if (!user) {
            return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
        }
        return reply.send({
            id: user.id,
            name: user.name,
            email: user.email,
            profile_id: user.profile_id,
            profile_tag: user.profile_tag,
            company_id: user.company_id,
            email_verified: user.email_verified,
            is_approved: user.is_approved,
            finance: user.finance,
        });
    },

    async register(req: FastifyRequest, reply: FastifyReply) {
        const data = registerSchema.parse(req.body);

        const existing = await authRepository.findByEmail(data.email);
        if (existing) {
            return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'Email já cadastrado' });
        }

        const password_hash = await bcrypt.hash(data.password, 10);
        const user = await authRepository.create({
            name: data.name,
            email: data.email,
            password_hash,
            profile_id: data.profile_id,
            company_id: data.company_id ?? null,
        });

        return reply.status(201).send({
            id: user.id,
            name: user.name,
            email: user.email,
            profile_id: user.profile_id,
            company_id: user.company_id,
            is_approved: user.is_approved,
        });
    },

    async refresh(req: FastifyRequest, reply: FastifyReply) {
        const token = req.cookies?.refresh_token;
        if (!token) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Refresh token não fornecido' });
        }

        const payload = verifyRefreshToken(token);
        if (!payload) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Refresh token inválido ou expirado' });
        }

        const stored = await authRepository.findRefreshToken(token);
        if (!stored) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Refresh token revogado' });
        }

        const baseUser = await authRepository.findById(payload.sub);
        if (!baseUser) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Usuário não encontrado' });
        }

        const user = await authRepository.findByEmailWithProfile(baseUser.email);
        if (!user) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Usuário não encontrado' });
        }

        await authRepository.deleteRefreshToken(token);
        const newRefreshToken = signRefreshToken(payload.sub);
        await authRepository.saveRefreshToken(payload.sub, newRefreshToken, refreshExpiresAt());

        reply.setCookie('refresh_token', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/v1/auth/refresh',
            maxAge: 60 * 60 * 24 * 7,
        });

        // Recria a sessão no Redis — necessário se o Redis foi reiniciado ou limpo
        const redis = getRedisClient();
        if (redis) {
            const key = redisSessionKey(user.profile_tag, user.company_id, user.id);
            await redis.set(key, user.id, 'EX', 7 * 24 * 60 * 60);
        }

        return reply.send({
            access_token: signAccessToken({
                sub: user.id,
                email: user.email,
                company_id: user.company_id,
                profile_tag: user.profile_tag,
                finance: user.finance,
            }),
        });
    },

    async logout(req: FastifyRequest, reply: FastifyReply) {
        const token = req.cookies?.refresh_token;
        if (token) {
            await authRepository.deleteRefreshToken(token);
            reply.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
        }
        return reply.send({ message: 'Logout realizado com sucesso' });
    },

    async approve(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const user = await authRepository.approveUser(id);
        if (!user) {
            return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
        }
        return reply.send({ message: 'Usuário aprovado com sucesso', user });
    },
};
