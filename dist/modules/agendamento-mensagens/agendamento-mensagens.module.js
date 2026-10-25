"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendamentoMensagensRouter = exports.agendamentoMensagensService = exports.scheduledMessageLoop = void 0;
const client_1 = require("../../database/client");
const notificacao_module_1 = require("../notificacoes/notificacao.module");
const agendamento_mensagens_repository_1 = require("./agendamento-mensagens.repository");
const agendamento_mensagens_service_1 = require("./agendamento-mensagens.service");
const agendamento_mensagens_controller_1 = require("./agendamento-mensagens.controller");
const agendamento_mensagens_routes_1 = require("./agendamento-mensagens.routes");
/** Envio pelo WhatsApp. Import tardio: o módulo whatsapp também depende do atendimento. */
const whatsappSender = {
    async sendText(connectionId, target, text) {
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        await whatsappService.sendTextToPhone(connectionId, target, text);
    },
};
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new agendamento_mensagens_repository_1.DrizzleScheduledMessageRepository(client_1.db);
/** Disparador periódico das mensagens vencidas; iniciado pelo main.ts. */
exports.scheduledMessageLoop = new agendamento_mensagens_service_1.DispatchLoop(new agendamento_mensagens_service_1.ScheduledMessageDispatcher(repository, whatsappSender, notificacao_module_1.notifier));
exports.agendamentoMensagensService = new agendamento_mensagens_service_1.AgendamentoMensagensService(repository, () => exports.scheduledMessageLoop.tick());
exports.agendamentoMensagensRouter = new agendamento_mensagens_routes_1.AgendamentoMensagensRouter(new agendamento_mensagens_controller_1.AgendamentoMensagensController(exports.agendamentoMensagensService));
//# sourceMappingURL=agendamento-mensagens.module.js.map