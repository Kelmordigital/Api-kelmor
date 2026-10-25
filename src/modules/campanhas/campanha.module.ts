import { db } from '../../database/client';
import { env } from '../../config/env';
import { DrizzleCompanyDirectory } from '../companies/company-directory';
import { HttpCampaignsGateway } from './campaigns.gateway';
import { DrizzleCampanhaRepository } from './campanha.repository';
import { CampaignService, ScheduledTextService } from './campanha.service';
import { CampanhaController } from './campanha.controller';
import { CampanhaRouter } from './campanha.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new DrizzleCampanhaRepository(db);
const gateway = new HttpCampaignsGateway({ baseUrl: env.CAMPAIGNS_API_URL, internalSecret: env.INTERNAL_API_SECRET });

export const campanhaRouter = new CampanhaRouter(new CampanhaController(
    new CampaignService(gateway, new DrizzleCompanyDirectory(db), repository),
    new ScheduledTextService(repository),
));
