"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.achievementProgressReader = exports.achievementsRouter = exports.achievementsService = void 0;
const client_1 = require("../../database/client");
const configuracao_geral_module_1 = require("../configuracao-geral/configuracao-geral.module");
const achievements_repository_1 = require("./achievements.repository");
const achievements_service_1 = require("./achievements.service");
const achievements_controller_1 = require("./achievements.controller");
const achievements_routes_1 = require("./achievements.routes");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
exports.achievementsService = new achievements_service_1.AchievementsService(new achievements_repository_1.DrizzleAchievementRepository(client_1.db), configuracao_geral_module_1.companyPermissionsReader);
exports.achievementsRouter = new achievements_routes_1.AchievementsRouter(new achievements_controller_1.AchievementsController(exports.achievementsService));
/** Porta de leitura exposta a outros módulos (usuários). */
exports.achievementProgressReader = exports.achievementsService;
//# sourceMappingURL=achievements.module.js.map