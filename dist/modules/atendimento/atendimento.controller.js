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
exports.atendimentoController = void 0;
const contact_service_1 = require("./contact.service");
const ticket_service_1 = require("./ticket.service");
const message_service_1 = require("./message.service");
const dashboard_service_1 = require("./dashboard.service");
const produto_service_1 = require("../produtos/produto.service");
const configuracao_geral_service_1 = require("../configuracao-geral/configuracao-geral.service");
const client_1 = require("../../database/client");
const company_db_schema_1 = require("../companies/company.db.schema");
const drizzle_orm_1 = require("drizzle-orm");
exports.atendimentoController = {
    async listTickets(req, reply) {
        const companyId = req.user.company_id;
        const { status, search, connectionId, dateInit, dateEnd, limit, offset, queueId, userId, showAll, orderBy } = req.query;
        const statusIds = status === 'open' ? [1, 2] : status === 'closed' ? [3] : undefined;
        // Visibilidade por fila: não-admins só veem tickets das suas filas
        // (+ sem fila + os atribuídos a si). Admin/superAdmin veem tudo.
        const list = await ticket_service_1.ticketService.list(companyId, {
            statusIds,
            viewer: { userId: req.user.id, profileTag: req.user.profile_tag },
            connectionId: connectionId ? Number(connectionId) : undefined,
            queueId: queueId ? Number(queueId) : undefined,
            attendantId: userId || undefined,
            mineUserId: showAll === 'false' ? req.user.id : undefined,
            orderBy: orderBy === 'ASC' ? 'ASC' : 'DESC',
            search: search ?? undefined,
            dateInit: dateInit ?? undefined,
            dateEnd: dateEnd ?? undefined,
            limit: limit ? Number(limit) : undefined,
            offset: offset ? Number(offset) : undefined,
        });
        return reply.send(list);
    },
    async closeTicket(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const userId = req.user.id;
        const body = req.body;
        const ticket = await ticket_service_1.ticketService.closeTicket(Number(id), userId, companyId, body);
        return reply.send(ticket);
    },
    /** Dados leves pro modal de fechamento (mensagem de despedida + se a opção "com mensagem" deve aparecer) — sem exigir admin. */
    async closeConfig(req, reply) {
        const companyId = req.user.company_id;
        const [company, perms] = await Promise.all([
            client_1.db.select({ end_message: company_db_schema_1.companies.end_message }).from(company_db_schema_1.companies).where((0, drizzle_orm_1.eq)(company_db_schema_1.companies.id, companyId)).then(rows => rows[0]),
            (0, configuracao_geral_service_1.getCompanyPermissions)(companyId),
        ]);
        return reply.send({
            end_message: company?.end_message ?? null,
            send_ticket_goodbye_msg: perms.send_ticket_goodbye_msg,
        });
    },
    /** Alternativa exclusiva à despedida: fecha com pesquisa de satisfação (ticket só fecha de fato quando o cliente responder). */
    async closeTicketWithResearch(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const userId = req.user.id;
        try {
            const ticket = await ticket_service_1.ticketService.closeTicketWithResearch(Number(id), userId, companyId);
            return reply.send(ticket);
        }
        catch (err) {
            return reply.status(400).send({ error: err instanceof Error ? err.message : 'Erro ao iniciar pesquisa de satisfação' });
        }
    },
    /** Indica se o ticket tem pesquisa de satisfação disponível (fila vinculada a uma pesquisa ativa) — usado pra mostrar/esconder a opção na hora de fechar. */
    async researchAvailable(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const ticket = await ticket_service_1.ticketService.get(Number(id), companyId);
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket não encontrado' });
        const { pesquisaService } = await Promise.resolve().then(() => __importStar(require('../pesquisas/pesquisa.service')));
        const research = await pesquisaService.findActiveForQueue(ticket.queue_id, companyId);
        return reply.send({ available: !!research, name: research?.name ?? null });
    },
    async updateStatus(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const { statusId } = req.body;
        const ticket = await ticket_service_1.ticketService.updateStatus(Number(id), statusId, companyId);
        return reply.send(ticket);
    },
    async assignAttendant(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const userId = req.user.id;
        const ticket = await ticket_service_1.ticketService.assignAttendant(Number(id), userId, companyId);
        return reply.send(ticket);
    },
    async returnToQueue(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const ticket = await ticket_service_1.ticketService.returnToQueue(Number(id), req.user.id, companyId);
        return reply.send(ticket);
    },
    async reopen(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const ticket = await ticket_service_1.ticketService.reopen(Number(id), req.user.id, companyId);
        return reply.send(ticket);
    },
    async transfer(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const { attendantId, queueId } = req.body;
        if (!attendantId)
            return reply.status(400).send({ error: 'attendantId obrigatório' });
        if (!queueId)
            return reply.status(400).send({ error: 'queueId obrigatório' });
        try {
            const ticket = await ticket_service_1.ticketService.transfer(Number(id), req.user.id, attendantId, companyId, queueId);
            return reply.send(ticket);
        }
        catch (err) {
            if (err instanceof ticket_service_1.AtendenteNaoElegivelError || err instanceof ticket_service_1.TransferenciaParaSiMesmoError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    },
    async togglePin(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const ticket = await ticket_service_1.ticketService.togglePin(Number(id), companyId);
        return reply.send(ticket);
    },
    async countTickets(req, reply) {
        const { company_id, id: userId, profile_tag } = req.user;
        const counts = await ticket_service_1.ticketService.count(company_id, userId, profile_tag ?? 'user');
        return reply.send(counts);
    },
    async listAttendants(req, reply) {
        const list = await ticket_service_1.ticketService.listAttendants(req.user.company_id);
        return reply.send(list);
    },
    async createFunilLead(req, reply) {
        const companyId = req.user.company_id;
        const payload = req.body;
        const card = await ticket_service_1.ticketService.createFunilLead(companyId, payload);
        return reply.status(201).send(card);
    },
    async getFunilCards(req, reply) {
        const { search } = req.query;
        const cards = await ticket_service_1.ticketService.getFunilCards(req.user.company_id, search);
        return reply.send(cards);
    },
    async updateFunilStage(req, reply) {
        const { id } = req.params;
        const { stage } = req.body;
        if (!stage)
            return reply.status(400).send({ error: 'stage obrigatório' });
        const ticket = await ticket_service_1.ticketService.updateFunilStage(Number(id), stage, req.user.company_id);
        return reply.send(ticket);
    },
    async registerSale(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const payload = req.body;
        const ticket = await ticket_service_1.ticketService.registerSale(Number(id), companyId, payload);
        return reply.send(ticket);
    },
    async listMessages(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const msgs = await message_service_1.messageService.list(Number(id), companyId);
        return reply.send(msgs);
    },
    async sendMessage(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const userId = req.user.id;
        const { body, fromMe = true, contactId } = req.body;
        const msg = await message_service_1.messageService.save(Number(id), contactId ?? null, body, fromMe, companyId, { userId });
        if (fromMe) {
            const ticket = await ticket_service_1.ticketService.get(Number(id), companyId);
            if (ticket) {
                const contact = await contact_service_1.contactService.findById(ticket.contact_id);
                const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
                const connId = ticket.connection_id ?? undefined;
                if (contact?.number) {
                    // Com conexão no ticket, roteia por ela (bays ou API oficial);
                    // sem conexão, mantém o envio pela sessão padrão do bays.
                    const sending = connId
                        ? whatsappService.sendTextToPhone(connId, contact.number, body)
                        : whatsappService.sendMessage(contact.number, body);
                    Promise.resolve(sending)
                        .then(async (result) => {
                        // Envio oficial devolve o wamid — grava para casar o ACK do webhook
                        const wamid = result?.wabMessageId;
                        if (!wamid)
                            return;
                        const { db } = await Promise.resolve().then(() => __importStar(require('../../database/client')));
                        const { atendimento_messages } = await Promise.resolve().then(() => __importStar(require('./atendimento.db.schema')));
                        const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
                        await db.update(atendimento_messages)
                            .set({ wab_message_id: wamid, ack: 1 })
                            .where(eq(atendimento_messages.id, msg.id));
                    })
                        .catch((err) => {
                        console.error('[sendMessage] erro no envio WhatsApp:', err.message);
                    });
                }
                else if (contact?.lid) {
                    // Contato username-only (sem número): responde roteando pelo LID
                    whatsappService.sendMessageViaLid(contact.lid, body, connId).catch((err) => {
                        console.error('[sendMessage] bays error (lid):', err.message);
                    });
                }
                else {
                    console.warn('[sendMessage] Contato sem número nem LID, não foi enviado via WhatsApp');
                }
            }
        }
        return reply.send(msg);
    },
    async ticketStatusByContact(req, reply) {
        const companyId = req.user.company_id;
        const { dateInit, dateEnd, limit, offset } = req.query;
        const result = await ticket_service_1.ticketService.statusByContact(companyId, {
            dateInit: dateInit ?? undefined,
            dateEnd: dateEnd ?? undefined,
            limit: limit ? Number(limit) : 50,
            offset: offset ? Number(offset) : 0,
        });
        return reply.send(result);
    },
    async listContacts(req, reply) {
        const companyId = req.user.company_id;
        const list = await contact_service_1.contactService.list(companyId);
        return reply.send(list);
    },
    async listContactTickets(req, reply) {
        const { contactId } = req.params;
        const companyId = req.user.company_id;
        const list = await ticket_service_1.ticketService.listByContact(Number(contactId), companyId);
        return reply.send(list);
    },
    /** Catálogo de produtos para consulta durante o atendimento (carrinho no chat) — leitura, sem exigir admin. */
    async listProdutos(req, reply) {
        const companyId = req.user.company_id;
        const list = await produto_service_1.produtoService.list(companyId);
        return reply.send(list.filter(p => p.is_active));
    },
    async listContactsReport(req, reply) {
        const companyId = req.user.company_id;
        const { search, limit, offset } = req.query;
        const result = await contact_service_1.contactService.listReport(companyId, {
            search: search ?? undefined,
            limit: limit ? Number(limit) : 50,
            offset: offset ? Number(offset) : 0,
        });
        return reply.send(result);
    },
    async exportContactsExcel(req, reply) {
        const companyId = req.user.company_id;
        const { search } = req.query;
        const buffer = await contact_service_1.contactService.exportExcel(companyId, search);
        return reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', 'attachment; filename="contatos.xlsx"')
            .send(buffer);
    },
    // ────── Analytics de vendas ──────
    async dashboardNotSalesByConnection(req, reply) {
        const { startDate, endDate } = req.query;
        const data = await dashboard_service_1.dashboardService.notSalesByConnection(req.user.company_id, startDate, endDate);
        return reply.send(data);
    },
    async dashboardNotSalesByChannel(req, reply) {
        const { startDate, endDate } = req.query;
        const data = await dashboard_service_1.dashboardService.notSalesByChannel(req.user.company_id, startDate, endDate);
        return reply.send(data);
    },
    async dashboardSalesByConnection(req, reply) {
        const { startDate, endDate } = req.query;
        const data = await dashboard_service_1.dashboardService.salesByConnection(req.user.company_id, startDate, endDate);
        return reply.send(data);
    },
    async dashboardSalesByChannel(req, reply) {
        const { startDate, endDate } = req.query;
        const data = await dashboard_service_1.dashboardService.salesByChannel(req.user.company_id, startDate, endDate);
        return reply.send(data);
    },
    async listReasons(req, reply) {
        const data = await dashboard_service_1.dashboardService.listReasons(req.user.company_id);
        return reply.send(data);
    },
    async createReason(req, reply) {
        const { reason, color } = req.body;
        const data = await dashboard_service_1.dashboardService.createReason(req.user.company_id, reason, color);
        return reply.send(data);
    },
    // ────── Novos endpoints de dashboard por período ──────
    async dashKpis(req, reply) {
        const { period: raw } = req.query;
        const period = (0, dashboard_service_1.parsePeriod)(raw);
        const { profile_tag, company_id, id: userId } = req.user;
        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboard_service_1.dashboardService.getSuperAdminStats(period));
        }
        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getKpis(company_id, period, attendantId));
    },
    async dashGraph(req, reply) {
        const { period: raw } = req.query;
        const period = (0, dashboard_service_1.parsePeriod)(raw);
        const { profile_tag, company_id, id: userId } = req.user;
        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboard_service_1.dashboardService.getSuperAdminGraph(period));
        }
        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getGraph(company_id, period, attendantId));
    },
    async dashFunnel(req, reply) {
        const { profile_tag, company_id, id: userId } = req.user;
        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboard_service_1.dashboardService.getSuperAdminFunnel());
        }
        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getFunnel(company_id, attendantId));
    },
    async dashMovimentos(req, reply) {
        const { period: raw } = req.query;
        const period = (0, dashboard_service_1.parsePeriod)(raw);
        const { profile_tag, company_id, id: userId } = req.user;
        if (profile_tag === 'superAdmin') {
            return reply.send([]);
        }
        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getMovimentos(company_id, period, attendantId));
    },
    async dashRecent(req, reply) {
        const { limit } = req.query;
        const { profile_tag, company_id, id: userId } = req.user;
        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboard_service_1.dashboardService.getSuperAdminRecent());
        }
        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getRecent(company_id, Number(limit ?? 5), attendantId));
    },
    async dashTopAttendants(req, reply) {
        const { period: raw } = req.query;
        const period = (0, dashboard_service_1.parsePeriod)(raw);
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'user') {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }
        return reply.send(await dashboard_service_1.dashboardService.getTopAttendants(company_id, period));
    },
    async dashChannels(req, reply) {
        const { period: raw } = req.query;
        const period = (0, dashboard_service_1.parsePeriod)(raw);
        const { profile_tag, company_id, id: userId } = req.user;
        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }
        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getChannelsByPeriod(company_id, period, attendantId));
    },
    // ────── Financeiro ──────
    async financeiroKpis(req, reply) {
        const { startDate, endDate } = req.query;
        const companyId = req.user.company_id;
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroKpis(companyId, start, end));
    },
    async financeiroEvolucao(req, reply) {
        const { startDate, endDate } = req.query;
        const companyId = req.user.company_id;
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroEvolucao(companyId, start, end));
    },
    async financeiroOrigens(req, reply) {
        const { startDate, endDate } = req.query;
        const companyId = req.user.company_id;
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroOrigens(companyId, start, end));
    },
    async financeiroHistorico(req, reply) {
        const { startDate, endDate } = req.query;
        const companyId = req.user.company_id;
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroHistorico(companyId, start, end));
    },
    async financeiroPerdas(req, reply) {
        const { startDate, endDate } = req.query;
        const companyId = req.user.company_id;
        const start = startDate ? new Date(startDate) : undefined;
        const end = endDate ? new Date(endDate) : undefined;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroPerdas(companyId, start, end));
    },
};
//# sourceMappingURL=atendimento.controller.js.map