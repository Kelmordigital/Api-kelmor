import { db } from '../../database/client';
import { companyPermissionsReader } from '../configuracao-geral/configuracao-geral.module';
import { DrizzleCompanyDirectory } from '../companies/company-directory';
import { DrizzleApiKeyRepository, DrizzleApiMessageLogRepository } from './api-messages.repository';
import { ApiKeyService, ApiMessageService, type ConversationLinker, type MessageDelivery } from './api-messages.service';
import { ApiMessagesController } from './api-messages.controller';
import { ApiMessagesRouter } from './api-messages.routes';

/** Envio pelo WhatsApp (import tardio: o whatsapp depende do atendimento). */
const whatsappDelivery: MessageDelivery = {
    async sendText(connectionId, number, text) {
        const { whatsappService } = await import('../whatsapp/whatsapp.service');
        await whatsappService.sendTextToPhone(connectionId, number, text);
    },
};

/** Histórico de conversa: contato + ticket do atendimento (ticket aberto ou um novo já fechado). */
const atendimentoConversations: ConversationLinker = {
    async attach(companyId, number, connectionId, message) {
        const { contactService } = await import('../atendimento/contact.service');
        const { ticketService } = await import('../atendimento/ticket.service');
        const contact = await contactService.findOrCreate(companyId, number);
        const ticket = await ticketService.attachExternalMessage(companyId, contact.id, connectionId, message);
        return ticket.id;
    },
};

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
export const apiKeyService = new ApiKeyService(new DrizzleApiKeyRepository(db));

export const apiMessageService = new ApiMessageService(
    companyPermissionsReader,
    new DrizzleCompanyDirectory(db),
    whatsappDelivery,
    new DrizzleApiMessageLogRepository(db),
    atendimentoConversations,
);

export const apiMessagesRouter = new ApiMessagesRouter(new ApiMessagesController(apiKeyService, apiMessageService));
