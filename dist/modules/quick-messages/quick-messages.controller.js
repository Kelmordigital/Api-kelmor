"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuickMessageController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const pagination_1 = require("../../core/http/pagination");
const quick_messages_dto_1 = require("./quick-messages.dto");
/** Adapta HTTP ⇄ QuickMessageService: lê query/multipart e escolhe o status. */
class QuickMessageController {
    service;
    formReader;
    constructor(service, formReader) {
        this.service = service;
        this.formReader = formReader;
    }
    list = async (req, reply) => {
        const query = schema_validator_1.SchemaValidator.parse(quick_messages_dto_1.quickMessageListQuerySchema, req.query);
        const pagination = pagination_1.Pagination.fromQuery(query, quick_messages_dto_1.QUICK_MESSAGE_PAGINATION);
        return reply.send(await this.service.list((0, http_router_1.companyIdOf)(req), pagination, query.search));
    };
    create = async (req, reply) => {
        const companyId = (0, http_router_1.companyIdOf)(req);
        const form = await this.formReader.read(req, this.folderFor(companyId));
        return reply.status(201).send(await this.service.create(companyId, (0, quick_messages_dto_1.quickMessageInputFrom)(form), form.file));
    };
    update = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(quick_messages_dto_1.quickMessageIdParamsSchema, req.params);
        const companyId = (0, http_router_1.companyIdOf)(req);
        const form = await this.formReader.read(req, this.folderFor(companyId));
        return reply.send(await this.service.update(id, companyId, (0, quick_messages_dto_1.quickMessageInputFrom)(form), form.file));
    };
    remove = async (req, reply) => {
        const { id } = schema_validator_1.SchemaValidator.parse(quick_messages_dto_1.quickMessageIdParamsSchema, req.params);
        await this.service.remove(id, (0, http_router_1.companyIdOf)(req));
        return reply.status(204).send();
    };
    folderFor(companyId) {
        return `quick-messages/${companyId}`;
    }
}
exports.QuickMessageController = QuickMessageController;
//# sourceMappingURL=quick-messages.controller.js.map