import { db } from '../../database/client';
import { companyPermissionsReader } from '../configuracao-geral/configuracao-geral.module';
import { DrizzleAchievementRepository } from './achievements.repository';
import { AchievementsService, type AchievementProgressReader } from './achievements.service';
import { AchievementsController } from './achievements.controller';
import { AchievementsRouter } from './achievements.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
export const achievementsService = new AchievementsService(new DrizzleAchievementRepository(db), companyPermissionsReader);

export const achievementsRouter = new AchievementsRouter(new AchievementsController(achievementsService));

/** Porta de leitura exposta a outros módulos (usuários). */
export const achievementProgressReader: AchievementProgressReader = achievementsService;
