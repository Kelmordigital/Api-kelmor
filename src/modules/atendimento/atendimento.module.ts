import { db } from '../../database/client';
import { emitToCompany } from '../../shared/socket';
import { companyPermissionsReader } from '../configuracao-geral/configuracao-geral.module';
import { queueRouting } from '../filas/fila.module';
import { researchSurvey } from '../pesquisas/pesquisa.module';
import { messageAutoTagger } from '../etiquetas/etiqueta.module';
import { produtoCatalog } from '../produtos/produto.module';
import { salesReasonsReader } from '../crm/crm.module';
import { botsRepository } from '../bots/bots.repository';
import type { ResearchTicketCloser } from '../pesquisas/pesquisa.service';
import type {
    AtendimentoEvents, BotTicketGateway, ContactResolver, ConversationTickets, DefaultBotLookup, MessageRecorder, WhatsappSender,
} from './atendimento.ports';
import { shouldRunBot } from './ticket-status';
import { AttendantCapacity } from './tickets/attendant-capacity';
import { PgAttendantLock } from './tickets/attendant-lock';
import { TicketAccessPolicy } from './tickets/ticket-access';
import { AutomaticMessages } from './tickets/automatic-messages';
import { TicketInboxService } from './tickets/ticket-inbox.service';
import { TicketAssignmentService } from './tickets/ticket-assignment.service';
import { TicketClosingService } from './tickets/ticket-closing.service';
import { ConversationService } from './tickets/conversation.service';
import { AutoCloseLoop, TicketAutoCloser } from './ticket-auto-close';
import { MessageService } from './mensagens/message.service';
import { OutgoingMessageService } from './mensagens/outgoing-message.service';
import { ContactResolverService } from './contatos/contact-resolver.service';
import { ContactReportService } from './contatos/contact-report.service';
import { FunilStageService } from './funil/funil-stage.service';
import { FunilBoardService } from './funil/funil-board.service';
import { ContactsController, FunilController, MessagesController, TicketsController } from './atendimento.controller';
import { AtendimentoRouter } from './atendimento.routes';

/** Tempo real pelo socket da empresa (mesmos eventos e payloads de sempre). */
const events: AtendimentoEvents = {
    ticketCreated: (companyId, ticket) => emitToCompany(companyId, 'ticket:created', { ticket }),
    ticketUpdated: (companyId, ticket) => emitToCompany(companyId, 'ticket:updated', { ticket }),
    ticketClosed: (companyId, ticketId) => emitToCompany(companyId, 'ticket:closed', { ticketId }),
    messageCreated: (companyId, message, ticketId) => emitToCompany(companyId, 'message:created', { message, ticketId }),
};

/** Envio pelo WhatsApp. Import tardio: o módulo whatsapp também depende do atendimento. */
const whatsappService = async () => (await import('../whatsapp/whatsapp.service')).whatsappService;
const whatsapp: WhatsappSender = {
    sendTextToPhone: async (connectionId, target, text) => (await whatsappService()).sendTextToPhone(connectionId, target, text),
    sendMessage: async (phone, text) => (await whatsappService()).sendMessage(phone, text),
    sendMessageViaLid: async (lid, text, connectionId) => (await whatsappService()).sendMessageViaLid(lid, text, connectionId),
    isConnected: async (connectionId) => (await (await whatsappService()).getStatus(connectionId).catch(() => null))?.status === 'connected',
};

const bots: DefaultBotLookup = {
    hasDefaultActiveBot: async (companyId) => Boolean(await botsRepository.findDefaultActive(companyId)),
};

/** Composição do módulo: único lugar que escolhe as implementações concretas. */
export const funilStageService = new FunilStageService(db);
export const contactReports = new ContactReportService(db);
export const contactResolverService = new ContactResolverService(db, events);
export const messageService = new MessageService(db, events, messageAutoTagger);
export const attendantCapacity = new AttendantCapacity(db);

const access = new TicketAccessPolicy(db, companyPermissionsReader);
export const automaticMessages = new AutomaticMessages(db, companyPermissionsReader, messageService, whatsapp, events);

export const ticketInbox = new TicketInboxService(db, access, contactReports, events);
export const ticketAssignment = new TicketAssignmentService(db, new PgAttendantLock(db), companyPermissionsReader, queueRouting, events, automaticMessages);
export const ticketClosing = new TicketClosingService(db, companyPermissionsReader, researchSurvey, events, automaticMessages);
export const conversations = new ConversationService(db, companyPermissionsReader, bots, funilStageService, queueRouting, ticketAssignment, messageService, events);
export const funilBoard = new FunilBoardService(db, funilStageService, contactResolverService, contactReports, ticketAssignment, events);
const outgoing = new OutgoingMessageService(db, ticketInbox, access, companyPermissionsReader, messageService, automaticMessages, whatsapp);

export const atendimentoRouter = new AtendimentoRouter(
    new TicketsController(ticketInbox, ticketAssignment, ticketClosing, produtoCatalog, salesReasonsReader),
    new MessagesController(ticketInbox, access, messageService, outgoing),
    new ContactsController(contactReports),
    new FunilController(funilStageService, funilBoard),
);

/** Fecha tickets parados conforme "Fechar tickets abertos/pendentes após (h)" (seguro com várias réplicas). */
export const autoCloseLoop = new AutoCloseLoop(new TicketAutoCloser(
    (ticket, companyId, sendGoodbye, userId) => automaticMessages.sendGoodbye(ticket, companyId, sendGoodbye, userId),
));

// ── Portas para outros módulos (ISP) ──────────────────────────────────────────
export const contactResolver: ContactResolver = contactResolverService;
export const conversationTickets: ConversationTickets = conversations;
export const messageRecorder: MessageRecorder = messageService;
export const researchTicketCloser: ResearchTicketCloser = ticketClosing;
export const botTicketGateway: BotTicketGateway = {
    routeToQueue: (ticketId, companyId, queueId) => ticketAssignment.routeToQueue(ticketId, companyId, queueId),
    isInBotFlow: async (ticketId, companyId) => {
        const ticket = await ticketInbox.get(ticketId, companyId);
        return Boolean(ticket && shouldRunBot(ticket));
    },
};
