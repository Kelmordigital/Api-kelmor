"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProdutoController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const produto_dto_1 = require("./produto.dto");
/** Adapta HTTP ⇄ ProdutoService: extrai/valida entrada e escolhe o status. */
class ProdutoController {
    service;
    constructor(service) {
        this.service = service;
    }
    list = async (req, reply) => {
        return reply.send(await this.service.list((0, http_router_1.companyIdOf)(req)));
    };
    findById = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(produto_dto_1.produtoIdParamsSchema, req.params);
        return reply.send(await this.service.findById(id, (0, http_router_1.companyIdOf)(req)));
    };
    create = async (req, reply) => {
        const input = schema_validator_1.SchemaValidator.parse(produto_dto_1.createProdutoSchema, req.body);
        return reply.status(201).send(await this.service.create((0, http_router_1.companyIdOf)(req), input));
    };
    update = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(produto_dto_1.produtoIdParamsSchema, req.params);
        const input = schema_validator_1.SchemaValidator.parse(produto_dto_1.updateProdutoSchema, req.body);
        return reply.send(await this.service.update(id, (0, http_router_1.companyIdOf)(req), input));
    };
    remove = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(produto_dto_1.produtoIdParamsSchema, req.params);
        await this.service.remove(id, (0, http_router_1.companyIdOf)(req));
        return reply.status(204).send();
    };
}
exports.ProdutoController = ProdutoController;
//# sourceMappingURL=produto.controller.js.map