import { db } from '../../database/client';
import { getRedisClient } from '../../config/redis';
import { BcryptPasswordHasher } from '../../core/auth/password-hasher';
import { RedisSessionRevoker } from '../../core/auth/session';
import { accountApproval } from '../auth/auth.module';
import { activeCampaignsPauser } from '../campanhas/campanha.module';
import { metricsHistoryHandler } from '../monitoring/monitoring.module';
import { DrizzleSuperadminRepository } from './superadmin.repository';
import { CompanySessionsShutdown, SuperadminService } from './superadmin.service';
import { SuperadminController } from './superadmin.controller';
import { SuperadminRouter } from './superadmin.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new DrizzleSuperadminRepository(db);
const sessions = new RedisSessionRevoker(getRedisClient);

const service = new SuperadminService(repository, new BcryptPasswordHasher(), sessions, accountApproval, [
    new CompanySessionsShutdown(repository, sessions),
    activeCampaignsPauser,
]);

export const superadminRouter = new SuperadminRouter(new SuperadminController(service), metricsHistoryHandler);
