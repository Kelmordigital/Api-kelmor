"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const drizzle_orm_1 = require("drizzle-orm");
const auth_repository_1 = require("./auth.repository");
const jwt_1 = require("../../config/jwt");
const redis_1 = require("../../config/redis");
const totp_service_1 = require("./totp.service");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    profile_id: zod_1.z.number().int().min(1).max(3),
    company_id: zod_1.z.string().uuid().nullable().optional(),
});
const totpCodeSchema = zod_1.z.object({
    code: zod_1.z.string().min(6).max(9),
});
const loginTotpSchema = zod_1.z.object({
    ticket: zod_1.z.string().min(10),
    code: zod_1.z.string().min(6).max(9),
});
function refreshExpiresAt() {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}
function redisSessionKey(profileTag, companyId, userId) {
    return profileTag === 'superAdmin'
        ? `superadmin-${userId}`
        : `company-${companyId}-user-${userId}`;
}
async function issueSession(user, reply) {
    const accessToken = (0, jwt_1.signAccessToken)({
        sub: user.id,
        email: user.email,
        company_id: user.company_id,
        profile_tag: user.profile_tag,
        finance: user.finance,
    });
    const refreshToken = (0, jwt_1.signRefreshToken)(user.id);
    await auth_repository_1.authRepository.saveRefreshToken(user.id, refreshToken, refreshExpiresAt());
    const redis = (0, redis_1.getRedisClient)();
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
exports.authController = {
    async login(req, reply) {
        const { email, password } = loginSchema.parse(req.body);
        // Passo 1+2: credenciais
        const user = await auth_repository_1.authRepository.findByEmailWithProfile(email);
        if (!user) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Usuário ou senha inválido' });
        }
        const validPwd = await bcryptjs_1.default.compare(password, user.password_hash);
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
            const company = await auth_repository_1.authRepository.findCompanyById(user.company_id);
            if (!company?.status) {
                return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Empresa inativa' });
            }
        }
        // 2FA: senha correta sozinha não emite sessão — pede o código do autenticador
        if (user.totp_enabled) {
            return reply.send({ requires_totp: true, totp_ticket: (0, jwt_1.signTotpTicket)(user.id) });
        }
        return issueSession(user, reply);
    },
    async loginTotp(req, reply) {
        const { ticket, code } = loginTotpSchema.parse(req.body);
        const payload = (0, jwt_1.verifyTotpTicket)(ticket);
        if (!payload) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão de verificação inválida ou expirada. Faça login novamente.' });
        }
        const redis = (0, redis_1.getRedisClient)();
        if (!redis) {
            return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Verificação em duas etapas indisponível no momento.' });
        }
        if (await redis.get(`totp:used:${payload.jti}`)) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão de verificação inválida ou expirada. Faça login novamente.' });
        }
        const user = await auth_repository_1.authRepository.findByIdWithProfile(payload.sub);
        if (!user || !user.totp_enabled) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão de verificação inválida ou expirada. Faça login novamente.' });
        }
        const ok = await totp_service_1.totpService.verifyLoginCode(user.id, code);
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
    async me(req, reply) {
        const user = await auth_repository_1.authRepository.findByIdWithProfile(req.user.id);
        if (!user) {
            return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
        }
        // Quantas filas/conexões o usuário tem atribuídas — usado no front para
        // avisar o atendente quando ele não recebe/enxerga atendimentos.
        const [qCount, cCount] = await Promise.all([
            client_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)::int` }).from(atendimento_db_schema_1.userQueues).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userQueues.user_id, user.id)),
            client_1.db.select({ n: (0, drizzle_orm_1.sql) `count(*)::int` }).from(atendimento_db_schema_1.userConnections).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.userConnections.user_id, user.id)),
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
    async register(req, reply) {
        const data = registerSchema.parse(req.body);
        // Trava: nunca criar outro superAdmin (só existe 1 no sistema, criado pelo seed)
        if (data.profile_id === 3) {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Não é permitido criar usuários superAdmin' });
        }
        const existing = await auth_repository_1.authRepository.findByEmail(data.email);
        if (existing) {
            return reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'Email já cadastrado' });
        }
        const password_hash = await bcryptjs_1.default.hash(data.password, 10);
        const user = await auth_repository_1.authRepository.create({
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
    async refresh(req, reply) {
        const token = req.cookies?.refresh_token;
        if (!token) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Refresh token não fornecido' });
        }
        const payload = (0, jwt_1.verifyRefreshToken)(token);
        if (!payload) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Refresh token inválido ou expirado' });
        }
        const stored = await auth_repository_1.authRepository.findRefreshToken(token);
        if (!stored) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Refresh token revogado' });
        }
        const baseUser = await auth_repository_1.authRepository.findById(payload.sub);
        if (!baseUser) {
            return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Usuário não encontrado' });
        }
        const user = await auth_repository_1.authRepository.findByEmailWithProfile(baseUser.email);
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
            const company = await auth_repository_1.authRepository.findCompanyById(user.company_id);
            if (!company?.status) {
                return reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Sessão encerrada. Faça login novamente.' });
            }
        }
        await auth_repository_1.authRepository.deleteRefreshToken(token);
        const newRefreshToken = (0, jwt_1.signRefreshToken)(payload.sub);
        await auth_repository_1.authRepository.saveRefreshToken(payload.sub, newRefreshToken, refreshExpiresAt());
        reply.setCookie('refresh_token', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/v1/auth/refresh',
            maxAge: 60 * 60 * 24 * 7,
        });
        // Recria a sessão no Redis — necessário se o Redis foi reiniciado ou limpo
        const redis = (0, redis_1.getRedisClient)();
        if (redis) {
            const key = redisSessionKey(user.profile_tag, user.company_id, user.id);
            await redis.set(key, user.id, 'EX', 7 * 24 * 60 * 60);
        }
        return reply.send({
            access_token: (0, jwt_1.signAccessToken)({
                sub: user.id,
                email: user.email,
                company_id: user.company_id,
                profile_tag: user.profile_tag,
                finance: user.finance,
            }),
        });
    },
    async logout(req, reply) {
        const token = req.cookies?.refresh_token;
        if (token) {
            await auth_repository_1.authRepository.deleteRefreshToken(token);
            reply.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
        }
        return reply.send({ message: 'Logout realizado com sucesso' });
    },
    async approve(req, reply) {
        const { id } = req.params;
        const user = await auth_repository_1.authRepository.approveUser(id);
        if (!user) {
            return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
        }
        return reply.send({ message: 'Usuário aprovado com sucesso', user });
    },
    async totpSetup(req, reply) {
        const result = await totp_service_1.totpService.generateSetup(req.user.id, req.user.email);
        if (result === 'redis_unavailable') {
            return reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Verificação em duas etapas indisponível no momento.' });
        }
        return reply.send(result);
    },
    async totpEnable(req, reply) {
        const { code } = totpCodeSchema.parse(req.body);
        const result = await totp_service_1.totpService.enable(req.user.id, code);
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
    async totpDisable(req, reply) {
        const { code } = totpCodeSchema.parse(req.body);
        const result = await totp_service_1.totpService.disable(req.user.id, code);
        if (result === 'not_enabled') {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Verificação em duas etapas não está ativa.' });
        }
        if (result === 'invalid_code') {
            return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Código inválido' });
        }
        return reply.send({ message: 'Verificação em duas etapas desativada' });
    },
};
//# sourceMappingURL=auth.controller.js.map