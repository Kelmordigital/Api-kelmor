"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PesquisaController = void 0;
const http_errors_1 = require("../../core/errors/http-errors");
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const pesquisa_dto_1 = require("./pesquisa.dto");
/** Adapta HTTP ⇄ cadastro e relatório de pesquisas. */
class PesquisaController {
    catalog;
    reports;
    constructor(catalog, reports) {
        this.catalog = catalog;
        this.reports = reports;
    }
    list = async (req, reply) => reply.send(await this.catalog.list((0, http_router_1.companyIdOf)(req)));
    listActive = async (req, reply) => reply.send(await this.catalog.listActive((0, http_router_1.companyIdOf)(req)));
    create = async (req, reply) => {
        const input = schema_validator_1.SchemaValidator.parse(pesquisa_dto_1.createResearchSchema, req.body);
        return reply.status(201).send(await this.catalog.create((0, http_router_1.companyIdOf)(req), input));
    };
    update = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(pesquisa_dto_1.researchIdParamsSchema, req.params);
        await this.catalog.update(id, (0, http_router_1.companyIdOf)(req), schema_validator_1.SchemaValidator.parse(pesquisa_dto_1.updateResearchSchema, req.body));
        return reply.send({ ok: true });
    };
    remove = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(pesquisa_dto_1.researchIdParamsSchema, req.params);
        await this.catalog.remove(id, (0, http_router_1.companyIdOf)(req));
        return reply.send({ ok: true });
    };
    report = async (req, reply) => {
        const query = schema_validator_1.SchemaValidator.parse(pesquisa_dto_1.reportQuerySchema, req.query);
        return reply.send(await this.reports.report((0, http_router_1.companyIdOf)(req), query));
    };
    reportView = async (req, reply) => {
        const raw = req.query;
        if (!raw.answerId)
            throw new http_errors_1.BadRequestError('answerId obrigatório');
        const query = schema_validator_1.SchemaValidator.parse(pesquisa_dto_1.reportViewQuerySchema, req.query);
        return reply.send(await this.reports.drillDown((0, http_router_1.companyIdOf)(req), query));
    };
}
exports.PesquisaController = PesquisaController;
//# sourceMappingURL=pesquisa.controller.js.map