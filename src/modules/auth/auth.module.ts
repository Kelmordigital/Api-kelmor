import { db } from '../../database/client';
import { env } from '../../config/env';
import { getRedisClient } from '../../config/redis';
import { BcryptPasswordHasher } from '../../core/auth/password-hasher';
import { RedisSessionStore } from '../../core/auth/session';
import { DrizzleAuthRepository } from './auth.repository';
import { JwtTokenService } from './auth.tokens';
import { OtplibTotp, RedisEphemeralStore, TwoFactorService } from './two-factor.service';
import { AccountService, AuthenticationService, type AccountApproval } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRouter } from './auth.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new DrizzleAuthRepository(db);
const hasher = new BcryptPasswordHasher();
const ephemeral = new RedisEphemeralStore(getRedisClient);
const twoFactor = new TwoFactorService(repository, ephemeral, new OtplibTotp(), hasher);
const accounts = new AccountService(repository, hasher);
const authentication = new AuthenticationService(
    repository, hasher, new JwtTokenService(), new RedisSessionStore(getRedisClient), twoFactor, ephemeral,
);

export const authRouter = new AuthRouter(
    new AuthController(authentication, accounts, twoFactor, env.NODE_ENV === 'production'),
    env.NODE_ENV !== 'test',
);

/** Porta de aprovação de contas, usada pelo painel do superAdmin. */
export const accountApproval: AccountApproval = accounts;
