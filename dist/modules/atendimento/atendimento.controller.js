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
const funil_stage_service_1 = require("./funil-stage.service");
const attendant_capacity_service_1 = require("./attendant-capacity.service");
const message_service_1 = require("./message.service");
const auth_schema_1 = require("../auth/auth.schema");
const dashboard_service_1 = require("./dashboard.service");
const produto_service_1 = require("../produtos/produto.service");
const configuracao_geral_service_1 = require("../configuracao-geral/configuracao-geral.service");
const agendamento_mensagens_service_1 = require("../agendamento-mensagens/agendamento-mensagens.service");
const client_1 = require("../../database/client");
const company_db_schema_1 = require("../companies/company.db.schema");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Lê e valida o filtro do dashboard (período/datas/conexão/fila/usuário) e resolve o attendantId:
 * atendente comum é sempre travado nos próprios números, admin pode escolher via query.
 * Retorna null (e já responde 400) quando o intervalo de datas exceder o limite.
 */
function getDashboardScope(req, reply) {
    try {
        const parsed = (0, dashboard_service_1.parseDashboardFilter)(req.query);
        const { profile_tag, id: userId } = req.user;
        return {
            period: parsed.period,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            connectionId: parsed.connectionId,
            queueId: parsed.queueId,
            attendantId: profile_tag === 'user' ? userId : parsed.attendantUserId,
        };
    }
    catch (err) {
        if (err instanceof dashboard_service_1.DateRangeTooLargeError) {
            reply.status(400).send({ error: err.message });
            return null;
        }
        throw err;
    }
}
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
        try {
            const ticket = await ticket_service_1.ticketService.assignAttendant(Number(id), userId, companyId);
            return reply.send(ticket);
        }
        catch (err) {
            if (err instanceof attendant_capacity_service_1.AttendantLimitReachedError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    },
    async returnToQueue(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        try {
            const ticket = await ticket_service_1.ticketService.returnToQueue(Number(id), req.user.id, companyId, req.user.profile_tag);
            return reply.send(ticket);
        }
        catch (err) {
            if (err instanceof ticket_service_1.ReturnTicketPermissionError) {
                return reply.status(403).send({ error: err.message });
            }
            throw err;
        }
    },
    async reopen(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        try {
            const ticket = await ticket_service_1.ticketService.reopen(Number(id), req.user.id, companyId, req.user.profile_tag);
            return reply.send(ticket);
        }
        catch (err) {
            if (err instanceof attendant_capacity_service_1.AttendantLimitReachedError) {
                return reply.status(409).send({ error: err.message });
            }
            if (err instanceof ticket_service_1.ReturnTicketPermissionError) {
                return reply.status(403).send({ error: err.message });
            }
            throw err;
        }
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
            if (err instanceof ticket_service_1.AtendenteNaoElegivelError || err instanceof ticket_service_1.TransferenciaParaSiMesmoError
                || err instanceof attendant_capacity_service_1.AttendantLimitReachedError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    },
    async scheduleMessage(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const { message, send_date } = req.body;
        if (!message?.trim())
            return reply.status(400).send({ error: 'message obrigatório' });
        if (!send_date)
            return reply.status(400).send({ error: 'send_date obrigatório' });
        try {
            const row = await agendamento_mensagens_service_1.agendamentoMensagensService.create(companyId, Number(id), req.user.id, {
                message: message.trim(),
                send_date,
            });
            return reply.status(201).send(row);
        }
        catch (err) {
            if (err instanceof agendamento_mensagens_service_1.TicketSemConexaoError) {
                return reply.status(400).send({ error: err.message });
            }
            throw err;
        }
    },
    async listScheduledMessages(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const rows = await agendamento_mensagens_service_1.agendamentoMensagensService.listByTicketContact(companyId, Number(id));
        return reply.send(rows);
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
    async listFunilStages(req, reply) {
        const stages = await funil_stage_service_1.funilStageService.listStages(req.user.company_id);
        return reply.send(stages);
    },
    async createFunilStage(req, reply) {
        const { name, color } = req.body;
        if (!name?.trim())
            return reply.status(400).send({ error: 'name obrigatório' });
        try {
            const stage = await funil_stage_service_1.funilStageService.createStage(req.user.company_id, name.trim(), color?.trim() || 'bg-blue-500');
            return reply.status(201).send(stage);
        }
        catch (err) {
            if (err instanceof funil_stage_service_1.FunilStageNomeDuplicadoError)
                return reply.status(409).send({ error: err.message });
            throw err;
        }
    },
    async updateFunilStage(req, reply) {
        const { id } = req.params;
        const { name, color } = req.body;
        try {
            const stage = await funil_stage_service_1.funilStageService.updateStage(Number(id), req.user.company_id, {
                name: name?.trim() || undefined,
                color: color?.trim() || undefined,
            });
            return reply.send(stage);
        }
        catch (err) {
            if (err instanceof funil_stage_service_1.FunilStageNaoEncontradaError)
                return reply.status(404).send({ error: err.message });
            if (err instanceof funil_stage_service_1.FunilStageProtegidaError)
                return reply.status(403).send({ error: err.message });
            if (err instanceof funil_stage_service_1.FunilStageNomeDuplicadoError)
                return reply.status(409).send({ error: err.message });
            throw err;
        }
    },
    async deleteFunilStage(req, reply) {
        const { id } = req.params;
        try {
            await funil_stage_service_1.funilStageService.deleteStage(Number(id), req.user.company_id);
            return reply.status(204).send();
        }
        catch (err) {
            if (err instanceof funil_stage_service_1.FunilStageNaoEncontradaError)
                return reply.status(404).send({ error: err.message });
            if (err instanceof funil_stage_service_1.FunilStageProtegidaError)
                return reply.status(403).send({ error: err.message });
            if (err instanceof funil_stage_service_1.FunilStageComTicketsError)
                return reply.status(409).send({ error: err.message });
            throw err;
        }
    },
    async reorderFunilStages(req, reply) {
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds))
            return reply.status(400).send({ error: 'orderedIds obrigatório' });
        await funil_stage_service_1.funilStageService.reorderStages(req.user.company_id, orderedIds);
        return reply.send({ ok: true });
    },
    async getFunilAnalytics(req, reply) {
        const { period } = req.query;
        const funnel = await funil_stage_service_1.funilStageService.getConversionFunnel(req.user.company_id, (0, dashboard_service_1.parsePeriod)(period));
        return reply.send(funnel);
    },
    async moveTicketFunilStage(req, reply) {
        const { id } = req.params;
        const { destinationStageId } = req.body;
        if (!destinationStageId)
            return reply.status(400).send({ error: 'destinationStageId obrigatório' });
        try {
            const ticket = await ticket_service_1.ticketService.moveTicketFunilStage(Number(id), destinationStageId, req.user.id, req.user.company_id, req.user.profile_tag);
            return reply.send(ticket);
        }
        catch (err) {
            if (err instanceof ticket_service_1.FunilDestinoInvalidoError)
                return reply.status(409).send({ error: err.message });
            if (err instanceof ticket_service_1.FunilMovimentoNaoAutorizadoError)
                return reply.status(403).send({ error: err.message });
            if (err instanceof ticket_service_1.ReturnTicketPermissionError)
                return reply.status(403).send({ error: err.message });
            if (err instanceof attendant_capacity_service_1.AttendantLimitReachedError)
                return reply.status(409).send({ error: err.message });
            throw err;
        }
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
        const ticket = await ticket_service_1.ticketService.get(Number(id), companyId);
        if (!ticket)
            return reply.status(404).send({ error: 'Ticket não encontrado' });
        try {
            await (0, ticket_service_1.ensureCanViewTicketMessages)(ticket, req.user.id, req.user.profile_tag);
        }
        catch (err) {
            if (err instanceof ticket_service_1.SpyTicketPermissionError)
                return reply.status(403).send({ error: err.message });
            throw err;
        }
        const msgs = await message_service_1.messageService.list(Number(id), companyId);
        return reply.send(msgs);
    },
    async sendMessage(req, reply) {
        const { id } = req.params;
        const companyId = req.user.company_id;
        const userId = req.user.id;
        const { body, fromMe = true, contactId, hideName = false } = req.body;
        // Ticket ainda Pendente(1)/Bot(9) = ninguém aceitou de fato — mandar
        // mensagem não pode ser um jeito de "atender" por trás do aceite (que é
        // onde o limite de atendimentos simultâneos é verificado). Sem isso, o
        // limite vira decorativo: basta não clicar em Aceitar e digitar direto.
        const ticket = fromMe ? await ticket_service_1.ticketService.get(Number(id), companyId) : null;
        if (fromMe && ticket && (ticket.status_id === 1 || ticket.status_id === 9)) {
            return reply.status(409).send({ error: 'Aceite o atendimento antes de enviar mensagens.' });
        }
        if (fromMe && ticket) {
            try {
                (0, ticket_service_1.ensureCanSendToTicket)(ticket, userId, req.user.profile_tag);
            }
            catch (err) {
                if (err instanceof ticket_service_1.SpyTicketPermissionError)
                    return reply.status(403).send({ error: err.message });
                throw err;
            }
        }
        // Assinatura "*Nome:*" (config "Ocultar nome do atendente no chat"):
        // só entra se a empresa tiver a permissão ligada e o atendente não
        // tiver pedido pra ocultar naquele envio específico (flag por request,
        // decidida no client conforme o modo temporário/permanente escolhido).
        let outgoingBody = body;
        if (fromMe && !hideName) {
            const perms = await (0, configuracao_geral_service_1.getCompanyPermissions)(companyId);
            if (perms.allow_show_name_on_chat) {
                const [sender] = await client_1.db.select({ name: auth_schema_1.users.name }).from(auth_schema_1.users).where((0, drizzle_orm_1.eq)(auth_schema_1.users.id, userId)).limit(1);
                if (sender?.name)
                    outgoingBody = (0, message_service_1.withAttendantNamePrefix)(body, sender.name);
            }
        }
        const msg = await message_service_1.messageService.save(Number(id), contactId ?? null, outgoingBody, fromMe, companyId, { userId });
        if (fromMe) {
            if (ticket) {
                const contact = await contact_service_1.contactService.findById(ticket.contact_id);
                const { whatsappService } = await Promise.resolve().then(() => __importStar(require('../whatsapp/whatsapp.service')));
                const connId = ticket.connection_id ?? undefined;
                if (contact?.number) {
                    // Com conexão no ticket, roteia por ela (bays ou API oficial);
                    // sem conexão, mantém o envio pela sessão padrão do bays.
                    const sending = connId
                        ? whatsappService.sendTextToPhone(connId, contact.number, outgoingBody)
                        : whatsappService.sendMessage(contact.number, outgoingBody);
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
                    whatsappService.sendMessageViaLid(contact.lid, outgoingBody, connId).catch((err) => {
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
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        const data = await dashboard_service_1.dashboardService.notSalesByConnection(req.user.company_id, scope);
        return reply.send(data);
    },
    async dashboardNotSalesByChannel(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        const data = await dashboard_service_1.dashboardService.notSalesByChannel(req.user.company_id, scope);
        return reply.send(data);
    },
    async dashboardNotSalesByReason(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        const data = await dashboard_service_1.dashboardService.notSalesByReason(req.user.company_id, scope);
        return reply.send(data);
    },
    async dashboardNotSalesByReasonOverTime(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        const data = await dashboard_service_1.dashboardService.notSalesByReasonOverTime(req.user.company_id, scope);
        return reply.send(data);
    },
    async dashboardSalesByConnection(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        const data = await dashboard_service_1.dashboardService.salesByConnection(req.user.company_id, scope);
        return reply.send(data);
    },
    async dashboardSalesByChannel(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        const data = await dashboard_service_1.dashboardService.salesByChannel(req.user.company_id, scope);
        return reply.send(data);
    },
    async dashboardTopCustomers(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        const { limit } = req.query;
        const data = await dashboard_service_1.dashboardService.topCustomers(req.user.company_id, scope, limit ? Number(limit) : undefined);
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
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin') {
            const { period: raw } = req.query;
            return reply.send(await dashboard_service_1.dashboardService.getSuperAdminStats((0, dashboard_service_1.parsePeriod)(raw)));
        }
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getKpis(company_id, scope));
    },
    async dashGraph(req, reply) {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin') {
            const { period: raw } = req.query;
            return reply.send(await dashboard_service_1.dashboardService.getSuperAdminGraph((0, dashboard_service_1.parsePeriod)(raw)));
        }
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getGraph(company_id, scope));
    },
    async dashGraphByStatus(req, reply) {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send({ period: 'day', data: [] });
        }
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getGraphByStatus(company_id, scope));
    },
    async dashFunnel(req, reply) {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboard_service_1.dashboardService.getSuperAdminFunnel());
        }
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getFunnel(company_id, scope));
    },
    async dashMovimentos(req, reply) {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin') {
            return reply.send([]);
        }
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getMovimentos(company_id, scope));
    },
    async dashRecent(req, reply) {
        const { limit } = req.query;
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboard_service_1.dashboardService.getSuperAdminRecent());
        }
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getRecent(company_id, Number(limit ?? 5), scope));
    },
    async dashTopAttendants(req, reply) {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'user') {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getTopAttendants(company_id, scope));
    },
    async dashChannels(req, reply) {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getChannelsByPeriod(company_id, scope));
    },
    async dashTicketsByConnection(req, reply) {
        const { profile_tag, company_id } = req.user;
        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getTicketsByConnection(company_id, scope));
    },
    // ────── Financeiro ──────
    async financeiroKpis(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroKpis(req.user.company_id, scope));
    },
    async financeiroEvolucao(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroEvolucao(req.user.company_id, scope));
    },
    async financeiroOrigens(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroOrigens(req.user.company_id, scope));
    },
    async financeiroHistorico(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroHistorico(req.user.company_id, scope));
    },
    async financeiroPerdas(req, reply) {
        const scope = getDashboardScope(req, reply);
        if (!scope)
            return;
        return reply.send(await dashboard_service_1.dashboardService.getFinanceiroPerdas(req.user.company_id, scope));
    },
};
//# sourceMappingURL=atendimento.controller.js.map