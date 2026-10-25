"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgendaController = void 0;
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const agenda_dto_1 = require("./agenda.dto");
const agenda_period_1 = require("./agenda-period");
/** Adapta HTTP ⇄ AgendaService: extrai/valida entrada e escolhe o status. */
class AgendaController {
    service;
    constructor(service) {
        this.service = service;
    }
    list = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const { start, end } = schema_validator_1.SchemaValidator.parse(agenda_dto_1.agendaListQuerySchema, req.query);
        return reply.send(await this.service.list(companyId, agenda_period_1.AgendaPeriod.of(start, end)));
    };
    create = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const input = schema_validator_1.SchemaValidator.parse(agenda_dto_1.createAgendamentoSchema, req.body);
        return reply.status(201).send(await this.service.create(companyId, req.user.id, input));
    };
    update = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const { id } = schema_validator_1.SchemaValidator.parse(agenda_dto_1.agendamentoIdParamsSchema, req.params);
        const input = schema_validator_1.SchemaValidator.parse(agenda_dto_1.updateAgendamentoSchema, req.body);
        return reply.send(await this.service.update(id, companyId, input));
    };
    remove = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const { id } = schema_validator_1.SchemaValidator.parse(agenda_dto_1.agendamentoIdParamsSchema, req.params);
        await this.service.remove(id, companyId);
        return reply.status(204).send();
    };
}
exports.AgendaController = AgendaController;
//# sourceMappingURL=agenda.controller.js.map