"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calendarSync = exports.integracaoRouter = void 0;
const client_1 = require("../../database/client");
const env_1 = require("../../config/env");
const google_gateways_1 = require("./google.gateways");
const oauth_state_1 = require("./oauth-state");
const integracao_repository_1 = require("./integracao.repository");
const integracao_service_1 = require("./integracao.service");
const calendar_sync_1 = require("./calendar-sync");
const integracao_controller_1 = require("./integracao.controller");
const integracao_routes_1 = require("./integracao.routes");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const google = new google_gateways_1.GoogleApis({
    clientId: env_1.env.GOOGLE_CLIENT_ID,
    clientSecret: env_1.env.GOOGLE_CLIENT_SECRET,
    redirectUri: env_1.env.GOOGLE_REDIRECT_URI,
});
const integrationService = new integracao_service_1.GoogleCalendarIntegrationService(new integracao_repository_1.DrizzleIntegrationRepository(client_1.db, 'google_calendar'), google, new oauth_state_1.JwtOAuthStateSigner());
exports.integracaoRouter = new integracao_routes_1.IntegracaoRouter(new integracao_controller_1.IntegracaoController(integrationService, env_1.env.FRONTEND_URL));
/** Porta exposta a outros módulos (agenda). */
exports.calendarSync = new calendar_sync_1.GoogleCalendarSync(integrationService, google);
//# sourceMappingURL=integracao.module.js.map