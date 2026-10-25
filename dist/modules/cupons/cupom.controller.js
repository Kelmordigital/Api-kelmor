"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CupomController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const cupom_dto_1 = require("./cupom.dto");
/** Adapta HTTP ⇄ CupomService: extrai/valida entrada e escolhe o status. */
class CupomController {
    service;
    constructor(service) {
        this.service = service;
    }
    list = async (req, reply) => {
        return reply.send(await this.service.list((0, http_router_1.companyIdOf)(req)));
    };
    create = async (req, reply) => {
        const input = schema_validator_1.SchemaValidator.parse(cupom_dto_1.cupomInputSchema, req.body);
        return reply.status(201).send(await this.service.create((0, http_router_1.companyIdOf)(req), input));
    };
    update = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(cupom_dto_1.cupomIdParamsSchema, req.params);
        const patch = schema_validator_1.SchemaValidator.parse(cupom_dto_1.cupomInputSchema, req.body);
        return reply.send(await this.service.update(id, (0, http_router_1.companyIdOf)(req), patch));
    };
    remove = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(cupom_dto_1.cupomIdParamsSchema, req.params);
        await this.service.remove(id, (0, http_router_1.companyIdOf)(req));
        return reply.status(204).send();
    };
}
exports.CupomController = CupomController;
//# sourceMappingURL=cupom.controller.js.map