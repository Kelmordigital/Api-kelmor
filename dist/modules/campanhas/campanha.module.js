"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campanhaRouter = void 0;
const client_1 = require("../../database/client");
const env_1 = require("../../config/env");
const company_directory_1 = require("../companies/company-directory");
const campaigns_gateway_1 = require("./campaigns.gateway");
const campanha_repository_1 = require("./campanha.repository");
const campanha_service_1 = require("./campanha.service");
const campanha_controller_1 = require("./campanha.controller");
const campanha_routes_1 = require("./campanha.routes");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new campanha_repository_1.DrizzleCampanhaRepository(client_1.db);
const gateway = new campaigns_gateway_1.HttpCampaignsGateway({ baseUrl: env_1.env.CAMPAIGNS_API_URL, internalSecret: env_1.env.INTERNAL_API_SECRET });
exports.campanhaRouter = new campanha_routes_1.CampanhaRouter(new campanha_controller_1.CampanhaController(new campanha_service_1.CampaignService(gateway, new company_directory_1.DrizzleCompanyDirectory(client_1.db), repository), new campanha_service_1.ScheduledTextService(repository)));
//# sourceMappingURL=campanha.module.js.map