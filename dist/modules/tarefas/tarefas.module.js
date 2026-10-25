"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tarefasRouter = void 0;
const client_1 = require("../../database/client");
const socket_1 = require("../../shared/socket");
const company_directory_1 = require("../companies/company-directory");
const tarefas_repository_1 = require("./tarefas.repository");
const tarefas_service_1 = require("./tarefas.service");
const tarefas_controller_1 = require("./tarefas.controller");
const tarefas_routes_1 = require("./tarefas.routes");
/** Avisa pelo socket da empresa quem está com o quadro aberto. */
const socketNotifier = {
    boardChanged: ({ companyId, userId }) => (0, socket_1.emitToCompany)(companyId, 'tarefa:board_changed', { owner_id: userId }),
};
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const service = new tarefas_service_1.TarefasService(new tarefas_repository_1.DrizzleTaskRepository(client_1.db), new company_directory_1.DrizzleCompanyDirectory(client_1.db), socketNotifier);
exports.tarefasRouter = new tarefas_routes_1.TarefasRouter(new tarefas_controller_1.TarefasController(service));
//# sourceMappingURL=tarefas.module.js.map