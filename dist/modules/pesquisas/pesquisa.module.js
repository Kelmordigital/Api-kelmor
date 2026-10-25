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
exports.researchSurvey = exports.pesquisaRouter = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../database/client");
const atendimento_db_schema_1 = require("../atendimento/atendimento.db.schema");
const pesquisa_repository_1 = require("./pesquisa.repository");
const pesquisa_service_1 = require("./pesquisa.service");
const pesquisa_controller_1 = require("./pesquisa.controller");
const pesquisa_routes_1 = require("./pesquisa.routes");
/**
 * Pergunta registrada no atendimento e enviada pelo WhatsApp. Imports tardios:
 * atendimento e whatsapp também dependem deste módulo.
 */
const whatsappSurveyChannel = {
    async targetFor(contactId) {
        const [contact] = await client_1.db.select({ number: atendimento_db_schema_1.contacts.number, lid: atendimento_db_schema_1.contacts.lid })
            .from(atendimento_db_schema_1.contacts).where((0, drizzle_orm_1.eq)(atendimento_db_schema_1.contacts.id, contactId)).limit(1);
        return contact?.number || (contact?.lid ? `lid:${contact.lid}` : null);
    },
    async send(ticket, target, text) {
        const { messageService } = await Promise.resolve().then(() => __importStar(require('../atendimento/message.service')));
        await messageService.save(ticket.id, ticket.contact_id, text, true, ticket.company_id, { mediaType: 'auto_survey' });
        const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
        if (ticket.connection_id)
            await whatsappService.sendTextToPhone(ticket.connection_id, target, text);
        else
            await whatsappService.sendMessage(target, text);
    },
};
const ticketCloser = {
    async finalizeAfterResearch(ticketId, companyId) {
        const { ticketService } = await Promise.resolve().then(() => __importStar(require('../atendimento/ticket.service')));
        await ticketService.finalizeAfterResearch(ticketId, companyId);
    },
};
/** Composição do módulo: único lugar que escolhe as implementações concretas. */
const repository = new pesquisa_repository_1.DrizzleResearchRepository(client_1.db);
exports.pesquisaRouter = new pesquisa_routes_1.PesquisaRouter(new pesquisa_controller_1.PesquisaController(new pesquisa_service_1.ResearchCatalogService(repository), new pesquisa_service_1.ResearchReportService(repository)));
/** Porta do fechamento com pesquisa, usada pelo atendimento e pelos webhooks do WhatsApp. */
exports.researchSurvey = new pesquisa_service_1.SurveyFlowService(repository, whatsappSurveyChannel, ticketCloser);
//# sourceMappingURL=pesquisa.module.js.map