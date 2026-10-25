import { db } from '../../database/client';
import { env } from '../../config/env';
import { GoogleApis } from './google.gateways';
import { JwtOAuthStateSigner } from './oauth-state';
import { DrizzleIntegrationRepository } from './integracao.repository';
import { GoogleCalendarIntegrationService } from './integracao.service';
import { GoogleCalendarSync, type CalendarSync } from './calendar-sync';
import { IntegracaoController } from './integracao.controller';
import { IntegracaoRouter } from './integracao.routes';

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const google = new GoogleApis({
    clientId:     env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri:  env.GOOGLE_REDIRECT_URI,
});

const integrationService = new GoogleCalendarIntegrationService(
    new DrizzleIntegrationRepository(db, 'google_calendar'),
    google,
    new JwtOAuthStateSigner(),
);

export const integracaoRouter = new IntegracaoRouter(new IntegracaoController(integrationService, env.FRONTEND_URL));

/** Porta exposta a outros módulos (agenda). */
export const calendarSync: CalendarSync = new GoogleCalendarSync(integrationService, google);
