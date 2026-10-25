"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountApproval = exports.authRouter = void 0;
const client_1 = require("../../database/client");
const env_1 = require("../../config/env");
const redis_1 = require("../../config/redis");
const password_hasher_1 = require("../../core/auth/password-hasher");
const session_1 = require("../../core/auth/session");
const auth_repository_1 = require("./auth.repository");
const auth_tokens_1 = require("./auth.tokens");
const two_factor_service_1 = require("./two-factor.service");
const auth_service_1 = require("./auth.service");
const auth_controller_1 = require("./auth.controller");
const auth_routes_1 = require("./auth.routes");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new auth_repository_1.DrizzleAuthRepository(client_1.db);
const hasher = new password_hasher_1.BcryptPasswordHasher();
const ephemeral = new two_factor_service_1.RedisEphemeralStore(redis_1.getRedisClient);
const twoFactor = new two_factor_service_1.TwoFactorService(repository, ephemeral, new two_factor_service_1.OtplibTotp(), hasher);
const accounts = new auth_service_1.AccountService(repository, hasher);
const authentication = new auth_service_1.AuthenticationService(repository, hasher, new auth_tokens_1.JwtTokenService(), new session_1.RedisSessionStore(redis_1.getRedisClient), twoFactor, ephemeral);
exports.authRouter = new auth_routes_1.AuthRouter(new auth_controller_1.AuthController(authentication, accounts, twoFactor, env_1.env.NODE_ENV === 'production'), env_1.env.NODE_ENV !== 'test');
/** Porta de aprovação de contas, usada pelo painel do superAdmin. */
exports.accountApproval = accounts;
//# sourceMappingURL=auth.module.js.map