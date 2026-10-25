"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendaRouter = void 0;
const client_1 = require("../../database/client");
const integracao_module_1 = require("../integracoes/integracao.module");
const agenda_repository_1 = require("./agenda.repository");
const agenda_service_1 = require("./agenda.service");
const agenda_controller_1 = require("./agenda.controller");
const agenda_routes_1 = require("./agenda.routes");
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const agendaService = new agenda_service_1.AgendaService(new agenda_repository_1.DrizzleAgendamentoRepository(client_1.db), integracao_module_1.calendarSync);
exports.agendaRouter = new agenda_routes_1.AgendaRouter(new agenda_controller_1.AgendaController(agendaService));
//# sourceMappingURL=agenda.module.js.map