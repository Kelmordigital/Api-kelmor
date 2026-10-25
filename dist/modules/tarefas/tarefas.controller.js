"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TarefasController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const tarefas_dto_1 = require("./tarefas.dto");
/** Adapta HTTP ⇄ TarefasService. */
class TarefasController {
    service;
    constructor(service) {
        this.service = service;
    }
    board = async (req, reply) => {
        const { owner_id } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.ownerQuerySchema, req.query);
        return reply.send(await this.service.getBoard(this.viewer(req), owner_id));
    };
    archived = async (req, reply) => {
        const { owner_id } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.ownerQuerySchema, req.query);
        return reply.send(await this.service.getArchived(this.viewer(req), owner_id));
    };
    byContact = async (req, reply) => {
        const viewer = this.viewer(req);
        const { contactId } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.contactParamsSchema, req.params);
        return reply.send(await this.service.listByContact(viewer, contactId));
    };
    create = async (req, reply) => {
        const viewer = this.viewer(req);
        const input = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.createTaskSchema, req.body);
        return reply.status(201).send(await this.service.create(viewer, input));
    };
    update = async (req, reply) => {
        const viewer = this.viewer(req);
        const { id } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.idParamsSchema, req.params);
        return reply.send(await this.service.update(viewer, id, schema_validator_1.SchemaValidator.parse(tarefas_dto_1.updateTaskSchema, req.body)));
    };
    move = async (req, reply) => {
        const viewer = this.viewer(req);
        const { id } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.idParamsSchema, req.params);
        const { column_id, index } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.moveTaskSchema, req.body);
        return reply.send(await this.service.move(viewer, id, column_id, index ?? 0));
    };
    setDone = async (req, reply) => {
        const viewer = this.viewer(req);
        const { id } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.idParamsSchema, req.params);
        const body = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.setDoneSchema, req.body);
        return reply.send(await this.service.setDone(viewer, id, body?.done ?? true));
    };
    setArchived = async (req, reply) => {
        const viewer = this.viewer(req);
        const { id } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.idParamsSchema, req.params);
        const body = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.setArchivedSchema, req.body);
        return reply.send(await this.service.setArchived(viewer, id, body?.archived ?? true));
    };
    remove = async (req, reply) => {
        const viewer = this.viewer(req);
        const { id } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.idParamsSchema, req.params);
        await this.service.remove(viewer, id);
        return reply.status(204).send();
    };
    createColumn = async (req, reply) => {
        const viewer = this.viewer(req);
        const { title } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.columnSchema, req.body);
        return reply.status(201).send(await this.service.createColumn(viewer, title));
    };
    renameColumn = async (req, reply) => {
        const viewer = this.viewer(req);
        const { id } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.idParamsSchema, req.params);
        const { title } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.columnSchema, req.body);
        return reply.send(await this.service.renameColumn(viewer, id, title));
    };
    deleteColumn = async (req, reply) => {
        const viewer = this.viewer(req);
        const { id } = schema_validator_1.SchemaValidator.parse(tarefas_dto_1.idParamsSchema, req.params);
        await this.service.deleteColumn(viewer, id);
        return reply.status(204).send();
    };
    viewer(req) {
        return {
            companyId: (0, http_router_1.requireCompanyId)(req),
            userId: req.user.id,
            isAdmin: req.user.profile_tag === 'admin' || req.user.profile_tag === 'superAdmin',
        };
    }
}
exports.TarefasController = TarefasController;
//# sourceMappingURL=tarefas.controller.js.map