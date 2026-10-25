"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.companyPermissionsReader = exports.configuracaoGeralRouter = void 0;
const client_1 = require("../../database/client");
const socket_1 = require("../../shared/socket");
const configuracao_geral_repository_1 = require("./configuracao-geral.repository");
const configuracao_geral_service_1 = require("./configuracao-geral.service");
const configuracao_geral_controller_1 = require("./configuracao-geral.controller");
const configuracao_geral_routes_1 = require("./configuracao-geral.routes");
/** Avisa o front em tempo real pelo socket da empresa. */
const socketNotifier = {
    permissionsChanged: (companyId) => (0, socket_1.emitToCompany)(companyId, 'company_permissions:updated', {}),
};
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const service = new configuracao_geral_service_1.ConfiguracaoGeralService(new configuracao_geral_repository_1.DrizzleConfiguracaoGeralRepository(client_1.db), socketNotifier);
exports.configuracaoGeralRouter = new configuracao_geral_routes_1.ConfiguracaoGeralRouter(new configuracao_geral_controller_1.ConfiguracaoGeralController(service));
/** Porta de leitura exposta a outros módulos. */
exports.companyPermissionsReader = service;
//# sourceMappingURL=configuracao-geral.module.js.map