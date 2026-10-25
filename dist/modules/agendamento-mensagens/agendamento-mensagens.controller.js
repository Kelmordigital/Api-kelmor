"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgendamentoMensagensController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const agendamento_mensagens_dto_1 = require("./agendamento-mensagens.dto");
/** Adapta HTTP ⇄ AgendamentoMensagensService. */
class AgendamentoMensagensController {
    service;
    constructor(service) {
        this.service = service;
    }
    schedule = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const { id } = schema_validator_1.SchemaValidator.parse(agendamento_mensagens_dto_1.ticketIdParamsSchema, req.params);
        const input = schema_validator_1.SchemaValidator.parse(agendamento_mensagens_dto_1.scheduleMessageSchema, req.body);
        return reply.status(201).send(await this.service.create(companyId, id, req.user.id, input));
    };
    list = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const { id } = schema_validator_1.SchemaValidator.parse(agendamento_mensagens_dto_1.ticketIdParamsSchema, req.params);
        return reply.send(await this.service.listByTicketContact(companyId, id));
    };
    update = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const { id } = schema_validator_1.SchemaValidator.parse(agendamento_mensagens_dto_1.scheduledIdParamsSchema, req.params);
        const input = schema_validator_1.SchemaValidator.parse(agendamento_mensagens_dto_1.updateScheduledMessageSchema, req.body);
        return reply.send(await this.service.update(companyId, id, input));
    };
    cancel = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const { id } = schema_validator_1.SchemaValidator.parse(agendamento_mensagens_dto_1.scheduledIdParamsSchema, req.params);
        return reply.send(await this.service.cancel(companyId, id));
    };
}
exports.AgendamentoMensagensController = AgendamentoMensagensController;
//# sourceMappingURL=agendamento-mensagens.controller.js.map