import { FastifyRequest, FastifyReply } from 'fastify';
import { contactService } from './contact.service';
import { ticketService } from './ticket.service';
import { messageService } from './message.service';
import { dashboardService, parsePeriod } from './dashboard.service';

export const atendimentoController = {

    async listTickets(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { status, search, connectionId, dateInit, dateEnd, limit, offset,
                queueId, userId, showAll, orderBy } =
            req.query as {
                status?: string;
                search?: string;
                connectionId?: string;
                dateInit?: string;
                dateEnd?: string;
                limit?: string;
                offset?: string;
                queueId?: string;
                userId?: string;
                showAll?: string;
                orderBy?: string;
            };

        const statusIds = status === 'open' ? [1, 2] : status === 'closed' ? [3] : undefined;

        // Visibilidade por fila: não-admins só veem tickets das suas filas
        // (+ sem fila + os atribuídos a si). Admin/superAdmin veem tudo.
        const list = await ticketService.list(companyId, {
            statusIds,
            viewer:        { userId: req.user.id, profileTag: req.user.profile_tag },
            connectionId:  connectionId ? Number(connectionId) : undefined,
            queueId:       queueId ? Number(queueId) : undefined,
            attendantId:   userId || undefined,
            mineUserId:    showAll === 'false' ? req.user.id : undefined,
            orderBy:       orderBy === 'ASC' ? 'ASC' : 'DESC',
            search:        search ?? undefined,
            dateInit:      dateInit ?? undefined,
            dateEnd:       dateEnd ?? undefined,
            limit:         limit  ? Number(limit)  : undefined,
            offset:        offset ? Number(offset) : undefined,
        });
        return reply.send(list);
    },

    async closeTicket(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const userId = req.user.id;
        const body = req.body as { ocurrence?: string; service_not_made?: boolean };
        const ticket = await ticketService.closeTicket(Number(id), userId, companyId, body);
        return reply.send(ticket);
    },

    async updateStatus(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const { statusId } = req.body as { statusId: number };
        const ticket = await ticketService.updateStatus(Number(id), statusId, companyId);
        return reply.send(ticket);
    },

    async assignAttendant(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const userId = req.user.id;
        const ticket = await ticketService.assignAttendant(Number(id), userId, companyId);
        return reply.send(ticket);
    },

    async returnToQueue(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const ticket = await ticketService.returnToQueue(Number(id), req.user.id, companyId);
        return reply.send(ticket);
    },

    async reopen(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const ticket = await ticketService.reopen(Number(id), req.user.id, companyId);
        return reply.send(ticket);
    },

    async transfer(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const { attendantId, queueId } = req.body as { attendantId: string; queueId?: number };
        if (!attendantId) return reply.status(400).send({ error: 'attendantId obrigatório' });
        const ticket = await ticketService.transfer(Number(id), req.user.id, attendantId, companyId, queueId);
        return reply.send(ticket);
    },

    async togglePin(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const ticket = await ticketService.togglePin(Number(id), companyId);
        return reply.send(ticket);
    },

    async countTickets(req: FastifyRequest, reply: FastifyReply) {
        const { company_id, id: userId, profile_tag } = req.user;
        const counts = await ticketService.count(company_id!, userId, profile_tag ?? 'user');
        return reply.send(counts);
    },

    async listAttendants(req: FastifyRequest, reply: FastifyReply) {
        const list = await ticketService.listAttendants(req.user.company_id!);
        return reply.send(list);
    },

    async createFunilLead(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const payload = req.body as {
            name?: string;
            phone?: string;
            email?: string;
            notes?: string;
            funil_stage?: string;
        };
        const card = await ticketService.createFunilLead(companyId, payload);
        return reply.status(201).send(card);
    },

    async getFunilCards(req: FastifyRequest, reply: FastifyReply) {
        const { search } = req.query as { search?: string };
        const cards = await ticketService.getFunilCards(req.user.company_id!, search);
        return reply.send(cards);
    },

    async updateFunilStage(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const { stage } = req.body as { stage: string };
        if (!stage) return reply.status(400).send({ error: 'stage obrigatório' });
        const ticket = await ticketService.updateFunilStage(Number(id), stage, req.user.company_id!);
        return reply.send(ticket);
    },

    async registerSale(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const payload = req.body as {
            isSale: boolean;
            saleAmount?: string;
            lossReasonId?: number;
            lossProductName?: string;
        };
        const ticket = await ticketService.registerSale(Number(id), companyId, payload);
        return reply.send(ticket);
    },

    async listMessages(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const msgs = await messageService.list(Number(id), companyId);
        return reply.send(msgs);
    },

    async sendMessage(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const userId = req.user.id;
        const { body, fromMe = true, contactId } = req.body as {
            body: string;
            fromMe?: boolean;
            contactId?: number;
        };

        const msg = await messageService.save(Number(id), contactId ?? null, body, fromMe, companyId, { userId });

        if (fromMe) {
            const ticket = await ticketService.get(Number(id), companyId);
            if (ticket) {
                const contact = await contactService.findById(ticket.contact_id);
                const { whatsappService } = await import('../whatsapp/whatsapp.service');
                const connId = ticket.connection_id ?? undefined;
                if (contact?.number) {
                    whatsappService.sendMessage(contact.number, body).catch((err: Error) => {
                        console.error('[sendMessage] bays error:', err.message);
                    });
                } else if (contact?.lid) {
                    // Contato username-only (sem número): responde roteando pelo LID
                    whatsappService.sendMessageViaLid(contact.lid, body, connId).catch((err: Error) => {
                        console.error('[sendMessage] bays error (lid):', err.message);
                    });
                } else {
                    console.warn('[sendMessage] Contato sem número nem LID, não foi enviado via WhatsApp');
                }
            }
        }

        return reply.send(msg);
    },

    async ticketStatusByContact(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { dateInit, dateEnd, limit, offset } = req.query as {
            dateInit?: string; dateEnd?: string; limit?: string; offset?: string;
        };
        const result = await ticketService.statusByContact(companyId, {
            dateInit:  dateInit  ?? undefined,
            dateEnd:   dateEnd   ?? undefined,
            limit:     limit  ? Number(limit)  : 50,
            offset:    offset ? Number(offset) : 0,
        });
        return reply.send(result);
    },

    async listContacts(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const list = await contactService.list(companyId);
        return reply.send(list);
    },

    async listContactsReport(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { search, limit, offset } = req.query as {
            search?: string;
            limit?:  string;
            offset?: string;
        };

        const result = await contactService.listReport(companyId, {
            search: search  ?? undefined,
            limit:  limit   ? Number(limit)  : 50,
            offset: offset  ? Number(offset) : 0,
        });

        return reply.send(result);
    },

    async exportContactsExcel(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { search } = req.query as { search?: string };

        const buffer = await contactService.exportExcel(companyId, search);

        return reply
            .header(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            .header('Content-Disposition', 'attachment; filename="contatos.xlsx"')
            .send(buffer);
    },

    // ────── Analytics de vendas ──────

    async dashboardNotSalesByConnection(req: FastifyRequest, reply: FastifyReply) {
        const { startDate, endDate } = req.query as { startDate: string; endDate: string };
        const data = await dashboardService.notSalesByConnection(req.user.company_id!, startDate, endDate);
        return reply.send(data);
    },

    async dashboardNotSalesByChannel(req: FastifyRequest, reply: FastifyReply) {
        const { startDate, endDate } = req.query as { startDate: string; endDate: string };
        const data = await dashboardService.notSalesByChannel(req.user.company_id!, startDate, endDate);
        return reply.send(data);
    },

    async dashboardSalesByConnection(req: FastifyRequest, reply: FastifyReply) {
        const { startDate, endDate } = req.query as { startDate: string; endDate: string };
        const data = await dashboardService.salesByConnection(req.user.company_id!, startDate, endDate);
        return reply.send(data);
    },

    async dashboardSalesByChannel(req: FastifyRequest, reply: FastifyReply) {
        const { startDate, endDate } = req.query as { startDate: string; endDate: string };
        const data = await dashboardService.salesByChannel(req.user.company_id!, startDate, endDate);
        return reply.send(data);
    },

    async listReasons(req: FastifyRequest, reply: FastifyReply) {
        const data = await dashboardService.listReasons(req.user.company_id!);
        return reply.send(data);
    },

    async createReason(req: FastifyRequest, reply: FastifyReply) {
        const { reason, color } = req.body as { reason: string; color?: string };
        const data = await dashboardService.createReason(req.user.company_id!, reason, color);
        return reply.send(data);
    },

    // ────── Novos endpoints de dashboard por período ──────

    async dashKpis(req: FastifyRequest, reply: FastifyReply) {
        const { period: raw } = req.query as { period?: string };
        const period = parsePeriod(raw);
        const { profile_tag, company_id, id: userId } = req.user;

        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboardService.getSuperAdminStats(period));
        }

        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboardService.getKpis(company_id!, period, attendantId));
    },

    async dashGraph(req: FastifyRequest, reply: FastifyReply) {
        const { period: raw } = req.query as { period?: string };
        const period = parsePeriod(raw);
        const { profile_tag, company_id, id: userId } = req.user;

        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboardService.getSuperAdminGraph(period));
        }

        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboardService.getGraph(company_id!, period, attendantId));
    },

    async dashFunnel(req: FastifyRequest, reply: FastifyReply) {
        const { profile_tag, company_id, id: userId } = req.user;

        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboardService.getSuperAdminFunnel());
        }

        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboardService.getFunnel(company_id!, attendantId));
    },

    async dashMovimentos(req: FastifyRequest, reply: FastifyReply) {
        const { period: raw } = req.query as { period?: string };
        const period = parsePeriod(raw);
        const { profile_tag, company_id, id: userId } = req.user;

        if (profile_tag === 'superAdmin') {
            return reply.send([]);
        }

        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboardService.getMovimentos(company_id!, period, attendantId));
    },

    async dashRecent(req: FastifyRequest, reply: FastifyReply) {
        const { limit } = req.query as { limit?: string };
        const { profile_tag, company_id, id: userId } = req.user;

        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboardService.getSuperAdminRecent());
        }

        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboardService.getRecent(company_id!, Number(limit ?? 5), attendantId));
    },

    async dashTopAttendants(req: FastifyRequest, reply: FastifyReply) {
        const { period: raw } = req.query as { period?: string };
        const period = parsePeriod(raw);
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'user') {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }

        return reply.send(await dashboardService.getTopAttendants(company_id, period));
    },

    async dashChannels(req: FastifyRequest, reply: FastifyReply) {
        const { period: raw } = req.query as { period?: string };
        const period = parsePeriod(raw);
        const { profile_tag, company_id, id: userId } = req.user;

        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }

        const attendantId = profile_tag === 'user' ? userId : undefined;
        return reply.send(await dashboardService.getChannelsByPeriod(company_id, period, attendantId));
    },

    // ────── Financeiro ──────

    async financeiroKpis(req: FastifyRequest, reply: FastifyReply) {
        const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
        const companyId = req.user.company_id!;
        const start = startDate ? new Date(startDate) : undefined;
        const end   = endDate   ? new Date(endDate)   : undefined;
        return reply.send(await dashboardService.getFinanceiroKpis(companyId, start, end));
    },

    async financeiroEvolucao(req: FastifyRequest, reply: FastifyReply) {
        const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
        const companyId = req.user.company_id!;
        const start = startDate ? new Date(startDate) : undefined;
        const end   = endDate   ? new Date(endDate)   : undefined;
        return reply.send(await dashboardService.getFinanceiroEvolucao(companyId, start, end));
    },

    async financeiroOrigens(req: FastifyRequest, reply: FastifyReply) {
        const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
        const companyId = req.user.company_id!;
        const start = startDate ? new Date(startDate) : undefined;
        const end   = endDate   ? new Date(endDate)   : undefined;
        return reply.send(await dashboardService.getFinanceiroOrigens(companyId, start, end));
    },

    async financeiroHistorico(req: FastifyRequest, reply: FastifyReply) {
        const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
        const companyId = req.user.company_id!;
        const start = startDate ? new Date(startDate) : undefined;
        const end   = endDate   ? new Date(endDate)   : undefined;
        return reply.send(await dashboardService.getFinanceiroHistorico(companyId, start, end));
    },

    async financeiroPerdas(req: FastifyRequest, reply: FastifyReply) {
        const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
        const companyId = req.user.company_id!;
        const start = startDate ? new Date(startDate) : undefined;
        const end   = endDate   ? new Date(endDate)   : undefined;
        return reply.send(await dashboardService.getFinanceiroPerdas(companyId, start, end));
    },
};
