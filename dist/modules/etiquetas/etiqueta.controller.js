"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomaticTagRuleController = exports.EtiquetaController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const etiqueta_dto_1 = require("./etiqueta.dto");
/** Adapta HTTP ⇄ EtiquetaService. */
class EtiquetaController {
    service;
    constructor(service) {
        this.service = service;
    }
    list = async (req, reply) => reply.send(await this.service.list((0, http_router_1.companyIdOf)(req)));
    stats = async (req, reply) => reply.send(await this.service.getStats((0, http_router_1.companyIdOf)(req)));
    create = async (req, reply) => {
        const input = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.createEtiquetaSchema, req.body);
        return reply.status(201).send(await this.service.create((0, http_router_1.companyIdOf)(req), input));
    };
    update = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.etiquetaIdParamsSchema, req.params);
        const input = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.updateEtiquetaSchema, req.body);
        return reply.send(await this.service.update(id, (0, http_router_1.companyIdOf)(req), input));
    };
    remove = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.etiquetaIdParamsSchema, req.params);
        await this.service.remove(id, (0, http_router_1.companyIdOf)(req));
        return reply.status(204).send();
    };
    listForContact = async (req, reply) => {
        const { contactId } = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.contactParamsSchema, req.params);
        return reply.send(await this.service.listForContact((0, http_router_1.companyIdOf)(req), contactId));
    };
    applyToContact = async (req, reply) => {
        const { contactId, etiquetaId } = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.contactEtiquetaParamsSchema, req.params);
        await this.service.applyToContact((0, http_router_1.companyIdOf)(req), contactId, etiquetaId);
        return reply.status(204).send();
    };
    removeFromContact = async (req, reply) => {
        const { contactId, etiquetaId } = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.contactEtiquetaParamsSchema, req.params);
        await this.service.removeFromContact((0, http_router_1.companyIdOf)(req), contactId, etiquetaId);
        return reply.status(204).send();
    };
}
exports.EtiquetaController = EtiquetaController;
/** Adapta HTTP ⇄ AutomaticTagRuleService. */
class AutomaticTagRuleController {
    service;
    constructor(service) {
        this.service = service;
    }
    list = async (req, reply) => reply.send(await this.service.list((0, http_router_1.companyIdOf)(req)));
    create = async (req, reply) => {
        const { keywords, etiqueta_ids } = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.automaticTagRuleSchema, req.body);
        return reply.status(201).send(await this.service.create((0, http_router_1.companyIdOf)(req), keywords, etiqueta_ids ?? []));
    };
    update = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.ruleIdParamsSchema, req.params);
        const { keywords, etiqueta_ids } = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.automaticTagRuleSchema, req.body);
        return reply.send(await this.service.update(id, (0, http_router_1.companyIdOf)(req), keywords, etiqueta_ids ?? []));
    };
    remove = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(etiqueta_dto_1.ruleIdParamsSchema, req.params);
        await this.service.remove(id, (0, http_router_1.companyIdOf)(req));
        return reply.status(204).send();
    };
}
exports.AutomaticTagRuleController = AutomaticTagRuleController;
//# sourceMappingURL=etiqueta.controller.js.map