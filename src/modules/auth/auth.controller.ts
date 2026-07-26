import { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { authRepository, UserWithProfile } from './auth.repository';
import { signAccessToken, signRefreshToken, verifyRefreshToken, signTotpTicket, verifyTotpTicket } from '../../config/jwt';
import { getRedisClient } from '../../config/redis';
import { totpService } from './totp.service';
import { db } from '../../database/client';
import { userQueues, userConnections } from '../atendimento/atendimento.db.schema';

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

const totpCodeSchema = z.object({
    code: z.string().min(6).max(9),
});

const loginTotpSchema = z.object({
    ticket: z.string().min(10),
    code: z.string().min(6).max(9),
});

function refreshExpiresAt(): Date {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

function redisSessionKey(profileTag: string, companyId: string | null, userId: string): string {
    return profileTag === 'superAdmin'
        ? `superadmin-${userId}`
        : `company-${companyId}-user-${userId}`;
}

async function issueSession(user: UserWithProfile, reply: FastifyReply) {
    const accessToken = signAccessToken({
        sub: user.id,
        email: user.email,
        company_id: user.company_id,
        profile_tag: user.profile_tag,
        finance: user.finance,
    });
    const refreshToken = signRefreshToken(user.id);
    await authRepository.saveRefreshToken(user.id, refreshToken, refreshExpiresAt());

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
            totp_enabled: user.totp_enabled,
            avatar_url: user.avatar_url,
            hide_name_active: user.hide_name_active,
        },
    });
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

        // 2FA: senha correta sozinha não emite sessão — pede o código do autenticador
        if (user.totp_enabled) {
            return reply.send({ requires_totp: true, totp_ticket: signTotpTicket(user.id) });
        }

        return issueSession(user, reply);
    },

    async loginTotp(req: FastifyRequest, reply: FastifyReply) {
        const { ticket, code } = loginTotpSchema.parse(req.body);

        const payload = verifyTotpTicket(ticket);
        if (!payload) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão de verificação inválida ou expirada. Faça login novamente.' });
        }

        const redis = getRedisClient();
        if (!redis) {
            return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Verificação em duas etapas indisponível no momento.' });
        }
        if (await redis.get(`totp:used:${payload.jti}`)) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão de verificação inválida ou expirada. Faça login novamente.' });
        }

        const user = await authRepository.findByIdWithProfile(payload.sub);
        if (!user || !user.totp_enabled) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão de verificação inválida ou expirada. Faça login novamente.' });
        }

        const ok = await totpService.verifyLoginCode(user.id, code);
        if (!ok) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Código inválido' });
        }

        // SET NX = consumo atômico: requisições concorrentes com o mesmo ticket
        // não geram duas sessões — só a primeira grava a chave e passa.
        const consumed = await redis.set(`totp:used:${payload.jti}`, '1', 'EX', 300, 'NX');
        if (consumed !== 'OK') {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão de verificação inválida ou expirada. Faça login novamente.' });
        }
        return issueSession(user, reply);
    },

    async me(req: FastifyRequest, reply: FastifyReply) {
        const user = await authRepository.findByIdWithProfile(req.user.id);
        if (!user) {
            return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
        }
        // Quantas filas/conexões o usuário tem atribuídas — usado no front para
        // avisar o atendente quando ele não recebe/enxerga atendimentos.
        const [qCount, cCount] = await Promise.all([
            db.select({ n: sql<number>`count(*)::int` }).from(userQueues).where(eq(userQueues.user_id, user.id)),
            db.select({ n: sql<number>`count(*)::int` }).from(userConnections).where(eq(userConnections.user_id, user.id)),
        ]);
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
            totp_enabled: user.totp_enabled,
            avatar_url: user.avatar_url,
            hide_name_active: user.hide_name_active,
            queue_count: qCount[0]?.n ?? 0,
            connection_count: cCount[0]?.n ?? 0,
        });
    },

    async register(req: FastifyRequest, reply: FastifyReply) {
        const data = registerSchema.parse(req.body);

        // Trava: nunca criar outro superAdmin (só existe 1 no sistema, criado pelo seed)
        if (data.profile_id === 3) {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Não é permitido criar usuários superAdmin' });
        }

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

        // Mesmas regras do login (passos 3-6): conta bloqueada ou empresa inativa não renova sessão
        if (!user.email_verified || !user.is_approved) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão encerrada. Faça login novamente.' });
        }
        if (user.profile_tag !== 'superAdmin') {
            if (!user.company_id) {
                return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão encerrada. Faça login novamente.' });
            }
            const company = await authRepository.findCompanyById(user.company_id);
            if (!company?.status) {
                return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão encerrada. Faça login novamente.' });
            }
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

    async totpSetup(req: FastifyRequest, reply: FastifyReply) {
        const result = await totpService.generateSetup(req.user.id, req.user.email);
        if (result === 'redis_unavailable') {
            return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Verificação em duas etapas indisponível no momento.' });
        }
        return reply.send(result);
    },

    async totpEnable(req: FastifyRequest, reply: FastifyReply) {
        const { code } = totpCodeSchema.parse(req.body);
        const result = await totpService.enable(req.user.id, code);
        if (result === 'redis_unavailable') {
            return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Verificação em duas etapas indisponível no momento.' });
        }
        if (result === 'no_setup') {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Configuração expirada. Gere um novo QR code.' });
        }
        if (result === 'invalid_code') {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Código inválido' });
        }
        return reply.send({ recovery_codes: result });
    },

    async totpDisable(req: FastifyRequest, reply: FastifyReply) {
        const { code } = totpCodeSchema.parse(req.body);
        const result = await totpService.disable(req.user.id, code);
        if (result === 'not_enabled') {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Verificação em duas etapas não está ativa.' });
        }
        if (result === 'invalid_code') {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Código inválido' });
        }
        return reply.send({ message: 'Verificação em duas etapas desativada' });
    },
};
