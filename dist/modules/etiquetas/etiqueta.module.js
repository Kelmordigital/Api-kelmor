"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageAutoTagger = exports.contactTagger = exports.etiquetaRouter = exports.automaticTagRuleService = void 0;
const client_1 = require("../../database/client");
const company_directory_1 = require("../companies/company-directory");
const configuracao_geral_module_1 = require("../configuracao-geral/configuracao-geral.module");
const etiqueta_repository_1 = require("./etiqueta.repository");
const automatic_tag_rule_repository_1 = require("./automatic-tag-rule.repository");
const etiqueta_service_1 = require("./etiqueta.service");
const automatic_tag_rule_service_1 = require("./automatic-tag-rule.service");
const etiqueta_controller_1 = require("./etiqueta.controller");
const etiqueta_routes_1 = require("./etiqueta.routes");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const etiquetaService = new etiqueta_service_1.EtiquetaService(new etiqueta_repository_1.DrizzleEtiquetaRepository(client_1.db), new company_directory_1.DrizzleCompanyDirectory(client_1.db));
const ruleRepository = new automatic_tag_rule_repository_1.DrizzleAutomaticTagRuleRepository(client_1.db);
exports.automaticTagRuleService = new automatic_tag_rule_service_1.AutomaticTagRuleService(ruleRepository);
exports.etiquetaRouter = new etiqueta_routes_1.EtiquetaRouter(new etiqueta_controller_1.EtiquetaController(etiquetaService), new etiqueta_controller_1.AutomaticTagRuleController(exports.automaticTagRuleService));
/** Portas expostas a outros módulos: bot ("adicionar etiqueta") e atendimento (mensagens recebidas). */
exports.contactTagger = etiquetaService;
exports.messageAutoTagger = new automatic_tag_rule_service_1.AutomaticTagger(ruleRepository, configuracao_geral_module_1.companyPermissionsReader, etiquetaService);
//# sourceMappingURL=etiqueta.module.js.map