"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const auth_repository_1 = require("./auth.repository");
const jwt_1 = require("../../config/jwt");
const redis_1 = require("../../config/redis");
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
function refreshExpiresAt() {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}
function redisSessionKey(profileTag, companyId, userId) {
    return profileTag === 'superAdmin'
        ? `superadmin-${userId}`
        : `company-${companyId}-user-${userId}`;
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
        // Passo 7: emitir tokens
        const accessToken = (0, jwt_1.signAccessToken)({
            sub: user.id,
            email: user.email,
            company_id: user.company_id,
            profile_tag: user.profile_tag,
            finance: user.finance,
        });
        const refreshToken = (0, jwt_1.signRefreshToken)(user.id);
        await auth_repository_1.authRepository.saveRefreshToken(user.id, refreshToken, refreshExpiresAt());
        // Sessão Redis
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
            },
        });
    },
    async me(req, reply) {
        const user = await auth_repository_1.authRepository.findById(req.user.id);
        if (!user) {
            return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Usuário não encontrado' });
        }
        return reply.send({
            id: user.id,
            name: user.name,
            email: user.email,
            profile_id: user.profile_id,
            company_id: user.company_id,
            email_verified: user.email_verified,
            is_approved: user.is_approved,
            finance: user.finance,
        });
    },
    async register(req, reply) {
        const data = registerSchema.parse(req.body);
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
};
//# sourceMappingURL=auth.controller.js.map