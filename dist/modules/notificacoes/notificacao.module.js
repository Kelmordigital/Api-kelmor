"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifier = exports.notificacaoRouter = void 0;
const client_1 = require("../../database/client");
const socket_1 = require("../../shared/socket");
const notificacao_repository_1 = require("./notificacao.repository");
const notificacao_service_1 = require("./notificacao.service");
const notificacao_controller_1 = require("./notificacao.controller");
const notificacao_routes_1 = require("./notificacao.routes");
/** Tempo real pelo socket. Só alcança quem está conectado nesta instância da API. */
const socketPush = {
    push: (userId, notification) => (0, socket_1.emitToUser)(userId, 'notification:new', notification),
};
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const service = new notificacao_service_1.NotificationService(new notificacao_repository_1.DrizzleNotificationRepository(client_1.db), socketPush);
exports.notificacaoRouter = new notificacao_routes_1.NotificacaoRouter(new notificacao_controller_1.NotificacaoController(service));
/** Porta exposta a outros módulos para avisar usuários. */
exports.notifier = service;
//# sourceMappingURL=notificacao.module.js.map