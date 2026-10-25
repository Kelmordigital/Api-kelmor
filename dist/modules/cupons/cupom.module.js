"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cupomRouter = void 0;
const client_1 = require("../../database/client");
const cupom_repository_1 = require("./cupom.repository");
const cupom_type_policies_1 = require("./cupom-type.policies");
const cupom_service_1 = require("./cupom.service");
const cupom_controller_1 = require("./cupom.controller");
const cupom_routes_1 = require("./cupom.routes");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const cupomService = new cupom_service_1.CupomService(new cupom_repository_1.DrizzleCupomRepository(client_1.db), cupom_type_policies_1.CupomTypePolicies.default());
exports.cupomRouter = new cupom_routes_1.CupomRouter(new cupom_controller_1.CupomController(cupomService));
//# sourceMappingURL=cupom.module.js.map