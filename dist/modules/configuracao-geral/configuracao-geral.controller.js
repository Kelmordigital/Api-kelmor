"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfiguracaoGeralController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const configuracao_geral_dto_1 = require("./configuracao-geral.dto");
/** Adapta HTTP ⇄ ConfiguracaoGeralService. */
class ConfiguracaoGeralController {
    service;
    constructor(service) {
        this.service = service;
    }
    get = async (req, reply) => {
        return reply.send(await this.service.view((0, http_router_1.requireCompanyId)(req)));
    };
    update = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const body = schema_validator_1.SchemaValidator.parse(configuracao_geral_dto_1.updateConfiguracaoGeralSchema, req.body);
        return reply.send(await this.service.update(companyId, (0, configuracao_geral_dto_1.updateInputFrom)(body)));
    };
}
exports.ConfiguracaoGeralController = ConfiguracaoGeralController;
//# sourceMappingURL=configuracao-geral.controller.js.map