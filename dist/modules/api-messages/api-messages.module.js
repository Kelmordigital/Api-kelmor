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
exports.apiMessagesRouter = exports.apiMessageService = exports.apiKeyService = void 0;
const client_1 = require("../../database/client");
const configuracao_geral_module_1 = require("../configuracao-geral/configuracao-geral.module");
const company_directory_1 = require("../companies/company-directory");
const api_messages_repository_1 = require("./api-messages.repository");
const api_messages_service_1 = require("./api-messages.service");
const api_messages_controller_1 = require("./api-messages.controller");
const api_messages_routes_1 = require("./api-messages.routes");
/** Envio pelo WhatsApp (import tardio: o whatsapp depende do atendimento). */
const whatsappDelivery = {
    async sendText(connectionId, number, text) {
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        await whatsappService.sendTextToPhone(connectionId, number, text);
    },
};
/** Histórico de conversa: contato + ticket do atendimento (ticket aberto ou um novo já fechado). */
const atendimentoConversations = {
    async attach(companyId, number, connectionId, message) {
        const { contactService } = await Promise.resolve().then(() => __importStar(require('../atendimento/contact.service')));
        const { ticketService } = await Promise.resolve().then(() => __importStar(require('../atendimento/ticket.service')));
        const contact = await contactService.findOrCreate(companyId, number);
        const ticket = await ticketService.attachExternalMessage(companyId, contact.id, connectionId, message);
        return ticket.id;
    },
};
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
exports.apiKeyService = new api_messages_service_1.ApiKeyService(new api_messages_repository_1.DrizzleApiKeyRepository(client_1.db));
exports.apiMessageService = new api_messages_service_1.ApiMessageService(configuracao_geral_module_1.companyPermissionsReader, new company_directory_1.DrizzleCompanyDirectory(client_1.db), whatsappDelivery, new api_messages_repository_1.DrizzleApiMessageLogRepository(client_1.db), atendimentoConversations);
exports.apiMessagesRouter = new api_messages_routes_1.ApiMessagesRouter(new api_messages_controller_1.ApiMessagesController(exports.apiKeyService, exports.apiMessageService));
//# sourceMappingURL=api-messages.module.js.map