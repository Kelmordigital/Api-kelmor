import type { FastifyReply, FastifyRequest } from 'fastify';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { companyIdOf } from '../../core/http/http-router';
import { parsePeriod } from '../../core/time/period';
import type { ProdutoCatalog } from '../produtos/produto.service';
import type { SalesReasonsReader } from '../crm/crm-config.service';
import {
    ticketIdParams, contactIdParams, listTicketsQuery, pageQuery, transferBody, closeBody, saleBody, sendMessageBody,
    funilCardsQuery, funilAnalyticsQuery, moveStageBody, createStageBody, updateStageBody, reorderStagesBody, createLeadBody,
} from './atendimento.dto';
import { TicketNaoEncontradoError } from './atendimento.errors';
import type { TicketInboxService } from './tickets/ticket-inbox.service';
import type { TicketAssignmentService } from './tickets/ticket-assignment.service';
import type { TicketClosingService } from './tickets/ticket-closing.service';
import type { TicketAccessPolicy } from './tickets/ticket-access';
import type { MessageService } from './mensagens/message.service';
import type { OutgoingMessageService } from './mensagens/outgoing-message.service';
import type { ContactReportService } from './contatos/contact-report.service';
import type { FunilStageService } from './funil/funil-stage.service';
import type { FunilBoardService } from './funil/funil-board.service';

type Req = FastifyRequest;
type Rep = FastifyReply;
const idOf = (req: Req) => SchemaValidator.parse(ticketIdParams, req.params).id;

/** Tickets: caixa de entrada, transições, fechamento, venda e dados de apoio ao chat. */
export class TicketsController {
    constructor(
        private readonly inbox: TicketInboxService,
        private readonly assignment: TicketAssignmentService,
        private readonly closing: TicketClosingService,
        private readonly catalog: ProdutoCatalog,
        private readonly reasons: SalesReasonsReader,
    ) {}

    list = async (req: Req, reply: Rep) => {
        const q = SchemaValidator.parse(listTicketsQuery, req.query);
        // Visibilidade por fila/conexão para não-admins (admin/superAdmin veem tudo).
        return reply.send(await this.inbox.list(companyIdOf(req), {
            statusIds:    q.status === 'open' ? [1, 2] : q.status === 'closed' ? [3] : undefined,
            viewer:       { userId: req.user.id, profileTag: req.user.profile_tag },
            connectionId: q.connectionId,
            queueId:      q.queueId,
            attendantId:  q.userId,
            mineUserId:   q.showAll === 'false' ? req.user.id : undefined,
            orderBy:      q.orderBy === 'ASC' ? 'ASC' : 'DESC',
            search:       q.search,
            dateInit:     q.dateInit,
            dateEnd:      q.dateEnd,
            limit:        q.limit,
            offset:       q.offset,
        }));
    };

    count = async (req: Req, reply: Rep) =>
        reply.send(await this.inbox.count(companyIdOf(req), req.user.id, req.user.profile_tag ?? 'user'));

    statusByContact = async (req: Req, reply: Rep) => {
        const q = SchemaValidator.parse(pageQuery, req.query);
        return reply.send(await this.inbox.statusByContact(companyIdOf(req), { dateInit: q.dateInit, dateEnd: q.dateEnd, limit: q.limit ?? 50, offset: q.offset ?? 0 }));
    };

    assign = async (req: Req, reply: Rep) => reply.send(await this.assignment.assignAttendant(idOf(req), req.user.id, companyIdOf(req)));

    returnToQueue = async (req: Req, reply: Rep) =>
        reply.send(await this.assignment.returnToQueue(idOf(req), req.user.id, companyIdOf(req), req.user.profile_tag));

    reopen = async (req: Req, reply: Rep) =>
        reply.send(await this.assignment.reopen(idOf(req), req.user.id, companyIdOf(req), req.user.profile_tag));

    transfer = async (req: Req, reply: Rep) => {
        const id = idOf(req);
        const { attendantId, queueId } = SchemaValidator.parse(transferBody, req.body ?? {});
        return reply.send(await this.assignment.transfer(id, req.user.id, attendantId, companyIdOf(req), queueId));
    };

    togglePin = async (req: Req, reply: Rep) => reply.send(await this.inbox.togglePin(idOf(req), companyIdOf(req)));

    close = async (req: Req, reply: Rep) =>
        reply.send(await this.closing.closeTicket(idOf(req), req.user.id, companyIdOf(req), SchemaValidator.parse(closeBody, req.body)));

    closeWithResearch = async (req: Req, reply: Rep) =>
        reply.send(await this.closing.closeTicketWithResearch(idOf(req), req.user.id, companyIdOf(req)));

    researchAvailable = async (req: Req, reply: Rep) => reply.send(await this.closing.researchAvailable(idOf(req), companyIdOf(req)));

    closeConfig = async (req: Req, reply: Rep) => reply.send(await this.closing.closeConfig(companyIdOf(req)));

    registerSale = async (req: Req, reply: Rep) => {
        const id = idOf(req);
        return reply.send(await this.closing.registerSale(id, companyIdOf(req), SchemaValidator.parse(saleBody, req.body)));
    };

    listByContact = async (req: Req, reply: Rep) => {
        const { contactId } = SchemaValidator.parse(contactIdParams, req.params);
        return reply.send(await this.inbox.listByContact(contactId, companyIdOf(req)));
    };

    /** Catálogo de produtos para o carrinho no chat — só os ativos. */
    listProdutos = async (req: Req, reply: Rep) => reply.send((await this.catalog.list(companyIdOf(req))).filter((p) => p.is_active));

    listAttendants = async (req: Req, reply: Rep) => reply.send(await this.inbox.listAttendants(companyIdOf(req)));

    listReasons = async (req: Req, reply: Rep) => reply.send(await this.reasons.listReasons(companyIdOf(req)));
}

/** Mensagens do ticket: leitura (com o gate de "espiar") e envio. */
export class MessagesController {
    constructor(
        private readonly inbox: Pick<TicketInboxService, 'get'>,
        private readonly access: Pick<TicketAccessPolicy, 'ensureCanViewMessages'>,
        private readonly messages: Pick<MessageService, 'list'>,
        private readonly outgoing: OutgoingMessageService,
    ) {}

    list = async (req: Req, reply: Rep) => {
        const id = idOf(req);
        const companyId = companyIdOf(req);
        const ticket = await this.inbox.get(id, companyId);
        if (!ticket) throw new TicketNaoEncontradoError();
        await this.access.ensureCanViewMessages(ticket, req.user.id, req.user.profile_tag);
        return reply.send(await this.messages.list(id, companyId));
    };

    send = async (req: Req, reply: Rep) => {
        const ticketId = idOf(req);
        const input = SchemaValidator.parse(sendMessageBody, req.body);
        return reply.send(await this.outgoing.send({
            ticketId, companyId: companyIdOf(req), userId: req.user.id, profileTag: req.user.profile_tag, ...input,
        }));
    };
}

/** Contatos: lista, relatório paginado com etiquetas e exportação Excel. */
export class ContactsController {
    constructor(private readonly reports: ContactReportService) {}

    list = async (req: Req, reply: Rep) => reply.send(await this.reports.list(companyIdOf(req)));

    report = async (req: Req, reply: Rep) => {
        const q = SchemaValidator.parse(pageQuery, req.query);
        return reply.send(await this.reports.listReport(companyIdOf(req), { search: q.search, limit: q.limit ?? 50, offset: q.offset ?? 0 }));
    };

    exportExcel = async (req: Req, reply: Rep) => {
        const q = SchemaValidator.parse(pageQuery, req.query);
        const buffer = await this.reports.exportExcel(companyIdOf(req), q.search);
        return reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', 'attachment; filename="contatos.xlsx"')
            .send(buffer);
    };
}

/** Funil Kanban: cards, lead manual, mover card, etapas e conversão. */
export class FunilController {
    constructor(private readonly stages: FunilStageService, private readonly board: FunilBoardService) {}

    cards = async (req: Req, reply: Rep) =>
        reply.send(await this.board.getFunilCards(companyIdOf(req), SchemaValidator.parse(funilCardsQuery, req.query).search));

    createLead = async (req: Req, reply: Rep) =>
        reply.status(201).send(await this.board.createFunilLead(companyIdOf(req), SchemaValidator.parse(createLeadBody, req.body ?? {})));

    moveCard = async (req: Req, reply: Rep) => {
        const id = idOf(req);
        const { destinationStageId } = SchemaValidator.parse(moveStageBody, req.body ?? {});
        return reply.send(await this.board.moveTicketFunilStage(id, destinationStageId, req.user.id, companyIdOf(req), req.user.profile_tag));
    };

    listStages = async (req: Req, reply: Rep) => reply.send(await this.stages.listStages(companyIdOf(req)));

    createStage = async (req: Req, reply: Rep) => {
        const { name, color } = SchemaValidator.parse(createStageBody, req.body ?? {});
        return reply.status(201).send(await this.stages.createStage(companyIdOf(req), name, color));
    };

    updateStage = async (req: Req, reply: Rep) => {
        const id = idOf(req);
        return reply.send(await this.stages.updateStage(id, companyIdOf(req), SchemaValidator.parse(updateStageBody, req.body ?? {})));
    };

    deleteStage = async (req: Req, reply: Rep) => {
        await this.stages.deleteStage(idOf(req), companyIdOf(req));
        return reply.status(204).send();
    };

    reorderStages = async (req: Req, reply: Rep) => {
        const { orderedIds } = SchemaValidator.parse(reorderStagesBody, req.body ?? {});
        await this.stages.reorderStages(companyIdOf(req), orderedIds);
        return reply.send({ ok: true });
    };

    analytics = async (req: Req, reply: Rep) =>
        reply.send(await this.stages.getConversionFunnel(companyIdOf(req), parsePeriod(SchemaValidator.parse(funilAnalyticsQuery, req.query).period)));
}
