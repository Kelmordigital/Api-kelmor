"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsuarioController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const usuario_dto_1 = require("./usuario.dto");
/** Adapta HTTP ⇄ UsuarioService. */
class UsuarioController {
    service;
    constructor(service) {
        this.service = service;
    }
    listSelects = async (req, reply) => reply.send(await this.service.options((0, http_router_1.companyIdOf)(req)));
    list = async (req, reply) => reply.send(await this.service.list((0, http_router_1.companyIdOf)(req)));
    create = async (req, reply) => {
        const input = schema_validator_1.SchemaValidator.parse(usuario_dto_1.createUserSchema, req.body);
        return reply.status(201).send(await this.service.create(this.actor(req), input));
    };
    update = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(usuario_dto_1.userIdParamsSchema, req.params);
        await this.service.update(this.actor(req), id, schema_validator_1.SchemaValidator.parse(usuario_dto_1.updateUserSchema, req.body));
        return reply.send({ ok: true });
    };
    remove = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(usuario_dto_1.userIdParamsSchema, req.params);
        await this.service.remove(this.actor(req), id);
        return reply.send({ ok: true });
    };
    actor(req) {
        return { userId: req.user.id, companyId: (0, http_router_1.companyIdOf)(req) };
    }
}
exports.UsuarioController = UsuarioController;
//# sourceMappingURL=usuario.controller.js.map