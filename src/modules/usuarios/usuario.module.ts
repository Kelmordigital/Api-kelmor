import { db } from '../../database/client';
import { getRedisClient } from '../../config/redis';
import { BcryptPasswordHasher } from '../../core/auth/password-hasher';
import { RedisSessionRevoker } from '../../core/auth/session';
import { achievementProgressReader } from '../achievements/achievements.module';
import { DrizzleUserRepository } from './usuario.repository';
import { UsuarioService } from './usuario.service';
import { UsuarioController } from './usuario.controller';
import { UsuarioRouter } from './usuario.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const service = new UsuarioService(
    new DrizzleUserRepository(db),
    new BcryptPasswordHasher(),
    new RedisSessionRevoker(getRedisClient),
    achievementProgressReader,
);

export const usuarioRouter = new UsuarioRouter(new UsuarioController(service));
