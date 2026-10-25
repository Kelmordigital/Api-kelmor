import { FastifyRequest, FastifyReply } from 'fastify';
import { contactService } from './contact.service';
import {
    ticketService, AtendenteNaoElegivelError, TransferenciaParaSiMesmoError, ReturnTicketPermissionError,
    ensureCanViewTicketMessages, ensureCanSendToTicket, SpyTicketPermissionError,
    FunilDestinoInvalidoError, FunilMovimentoNaoAutorizadoError, TicketAssignConflictError,
} from './ticket.service';
import {
    funilStageService, FunilStageProtegidaError, FunilStageNomeDuplicadoError,
    FunilStageComTicketsError, FunilStageNaoEncontradaError,
} from './funil-stage.service';
import { AttendantLimitReachedError } from './attendant-capacity.service';
import { messageService, withAttendantNamePrefix } from './message.service';
import { users } from '../auth/auth.schema';
import { dashboardService, parsePeriod, parseDashboardFilter, DateRangeTooLargeError, DashboardScope } from './dashboard.service';
import { produtoCatalog } from '../produtos/produto.module';
import { companyPermissionsReader } from '../configuracao-geral/configuracao-geral.module';
import { db } from '../../database/client';
import { companies } from '../companies/company.db.schema';
import { eq } from 'drizzle-orm';

/**
 * Lê e valida o filtro do dashboard (período/datas/conexão/fila/usuário) e resolve o attendantId:
 * atendente comum é sempre travado nos próprios números, admin pode escolher via query.
 * Retorna null (e já responde 400) quando o intervalo de datas exceder o limite.
 */
function getDashboardScope(req: FastifyRequest, reply: FastifyReply): DashboardScope | null {
    try {
        const parsed = parseDashboardFilter(req.query as Record<string, unknown>);
        const { profile_tag, id: userId } = req.user;
        return {
            period:       parsed.period,
            startDate:    parsed.startDate,
            endDate:      parsed.endDate,
            connectionId: parsed.connectionId,
            queueId:      parsed.queueId,
            attendantId:  profile_tag === 'user' ? userId : parsed.attendantUserId,
        };
    } catch (err) {
        if (err instanceof DateRangeTooLargeError) {
            reply.status(400).send({ error: err.message });
            return null;
        }
        throw err;
    }
}

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
        const body = req.body as { ocurrence?: string; service_not_made?: boolean; sendGoodbye?: boolean };
        const ticket = await ticketService.closeTicket(Number(id), userId, companyId, body);
        return reply.send(ticket);
    },

    /** Dados leves pro modal de fechamento (mensagem de despedida + se a opção "com mensagem" deve aparecer) — sem exigir admin. */
    async closeConfig(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const [company, perms] = await Promise.all([
            db.select({ end_message: companies.end_message }).from(companies).where(eq(companies.id, companyId)).then(rows => rows[0]),
            companyPermissionsReader.forCompany(companyId),
        ]);
        return reply.send({
            end_message: company?.end_message ?? null,
            send_ticket_goodbye_msg: perms.send_ticket_goodbye_msg,
        });
    },

    /** Alternativa exclusiva à despedida: fecha com pesquisa de satisfação (ticket só fecha de fato quando o cliente responder). */
    async closeTicketWithResearch(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const userId = req.user.id;
        try {
            const ticket = await ticketService.closeTicketWithResearch(Number(id), userId, companyId);
            return reply.send(ticket);
        } catch (err) {
            return reply.status(400).send({ error: err instanceof Error ? err.message : 'Erro ao iniciar pesquisa de satisfação' });
        }
    },

    /** Indica se o ticket tem pesquisa de satisfação disponível (fila vinculada a uma pesquisa ativa) — usado pra mostrar/esconder a opção na hora de fechar. */
    async researchAvailable(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const ticket = await ticketService.get(Number(id), companyId);
        if (!ticket) return reply.status(404).send({ error: 'Ticket não encontrado' });

        const { researchSurvey: pesquisaService } = await import('../pesquisas/pesquisa.module');
        const research = await pesquisaService.findActiveForQueue(ticket.queue_id, companyId);
        return reply.send({ available: !!research, name: research?.name ?? null });
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
        try {
            const ticket = await ticketService.assignAttendant(Number(id), userId, companyId);
            return reply.send(ticket);
        } catch (err) {
            if (err instanceof AttendantLimitReachedError || err instanceof TicketAssignConflictError) {
                return reply.status(409).send({ error: err.message });
            }
            throw err;
        }
    },

    async returnToQueue(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        try {
            const ticket = await ticketService.returnToQueue(Number(id), req.user.id, companyId, req.user.profile_tag);
            return reply.send(ticket);
        } catch (err) {
            if (err instanceof ReturnTicketPermissionError) {
                return reply.status(403).send({ error: err.message });
            }
            throw err;
        }
    },

    async reopen(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        try {
            const ticket = await ticketService.reopen(Number(id), req.user.id, companyId, req.user.profile_tag);
            return reply.send(ticket);
        } catch (err) {
            if (err instanceof AttendantLimitReachedError) {
                return reply.status(409).send({ error: err.message });
            }
            if (err instanceof ReturnTicketPermissionError) {
                return reply.status(403).send({ error: err.message });
            }
            throw err;
        }
    },

    async transfer(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const { attendantId, queueId } = req.body as { attendantId: string; queueId?: number };
        if (!attendantId) return reply.status(400).send({ error: 'attendantId obrigatório' });
        if (!queueId) return reply.status(400).send({ error: 'queueId obrigatório' });
        try {
            const ticket = await ticketService.transfer(Number(id), req.user.id, attendantId, companyId, queueId);
            return reply.send(ticket);
        } catch (err) {
            if (err instanceof AtendenteNaoElegivelError || err instanceof TransferenciaParaSiMesmoError
                || err instanceof AttendantLimitReachedError) {
                return reply.status(409).send({ error: (err as Error).message });
            }
            throw err;
        }
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
            funil_stage_id?: number;
        };
        const card = await ticketService.createFunilLead(companyId, payload);
        return reply.status(201).send(card);
    },

    async getFunilCards(req: FastifyRequest, reply: FastifyReply) {
        const { search } = req.query as { search?: string };
        const cards = await ticketService.getFunilCards(req.user.company_id!, search);
        return reply.send(cards);
    },

    async listFunilStages(req: FastifyRequest, reply: FastifyReply) {
        const stages = await funilStageService.listStages(req.user.company_id!);
        return reply.send(stages);
    },

    async createFunilStage(req: FastifyRequest, reply: FastifyReply) {
        const { name, color } = req.body as { name?: string; color?: string };
        if (!name?.trim()) return reply.status(400).send({ error: 'name obrigatório' });
        try {
            const stage = await funilStageService.createStage(req.user.company_id!, name.trim(), color?.trim() || 'bg-blue-500');
            return reply.status(201).send(stage);
        } catch (err) {
            if (err instanceof FunilStageNomeDuplicadoError) return reply.status(409).send({ error: err.message });
            throw err;
        }
    },

    async updateFunilStage(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const { name, color } = req.body as { name?: string; color?: string };
        try {
            const stage = await funilStageService.updateStage(Number(id), req.user.company_id!, {
                name: name?.trim() || undefined,
                color: color?.trim() || undefined,
            });
            return reply.send(stage);
        } catch (err) {
            if (err instanceof FunilStageNaoEncontradaError) return reply.status(404).send({ error: err.message });
            if (err instanceof FunilStageProtegidaError) return reply.status(403).send({ error: err.message });
            if (err instanceof FunilStageNomeDuplicadoError) return reply.status(409).send({ error: err.message });
            throw err;
        }
    },

    async deleteFunilStage(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        try {
            await funilStageService.deleteStage(Number(id), req.user.company_id!);
            return reply.status(204).send();
        } catch (err) {
            if (err instanceof FunilStageNaoEncontradaError) return reply.status(404).send({ error: err.message });
            if (err instanceof FunilStageProtegidaError) return reply.status(403).send({ error: err.message });
            if (err instanceof FunilStageComTicketsError) return reply.status(409).send({ error: err.message });
            throw err;
        }
    },

    async reorderFunilStages(req: FastifyRequest, reply: FastifyReply) {
        const { orderedIds } = req.body as { orderedIds?: number[] };
        if (!Array.isArray(orderedIds)) return reply.status(400).send({ error: 'orderedIds obrigatório' });
        await funilStageService.reorderStages(req.user.company_id!, orderedIds);
        return reply.send({ ok: true });
    },

    async getFunilAnalytics(req: FastifyRequest, reply: FastifyReply) {
        const { period } = req.query as { period?: string };
        const funnel = await funilStageService.getConversionFunnel(req.user.company_id!, parsePeriod(period));
        return reply.send(funnel);
    },

    async moveTicketFunilStage(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const { destinationStageId } = req.body as { destinationStageId?: number };
        if (!destinationStageId) return reply.status(400).send({ error: 'destinationStageId obrigatório' });
        try {
            const ticket = await ticketService.moveTicketFunilStage(
                Number(id), destinationStageId, req.user.id, req.user.company_id!, req.user.profile_tag,
            );
            return reply.send(ticket);
        } catch (err) {
            if (err instanceof FunilDestinoInvalidoError) return reply.status(409).send({ error: err.message });
            if (err instanceof FunilMovimentoNaoAutorizadoError) return reply.status(403).send({ error: err.message });
            if (err instanceof ReturnTicketPermissionError) return reply.status(403).send({ error: err.message });
            if (err instanceof AttendantLimitReachedError) return reply.status(409).send({ error: err.message });
            throw err;
        }
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
        const ticket = await ticketService.get(Number(id), companyId);
        if (!ticket) return reply.status(404).send({ error: 'Ticket não encontrado' });
        try {
            await ensureCanViewTicketMessages(ticket, req.user.id, req.user.profile_tag);
        } catch (err) {
            if (err instanceof SpyTicketPermissionError) return reply.status(403).send({ error: err.message });
            throw err;
        }
        const msgs = await messageService.list(Number(id), companyId);
        return reply.send(msgs);
    },

    async sendMessage(req: FastifyRequest, reply: FastifyReply) {
        const { id } = req.params as { id: string };
        const companyId = req.user.company_id!;
        const userId = req.user.id;
        const { body, fromMe = true, contactId, hideName = false } = req.body as {
            body: string;
            fromMe?: boolean;
            contactId?: number;
            hideName?: boolean;
        };

        // Ticket ainda Pendente(1)/Bot(9) = ninguém aceitou de fato — mandar
        // mensagem não pode ser um jeito de "atender" por trás do aceite (que é
        // onde o limite de atendimentos simultâneos é verificado). Sem isso, o
        // limite vira decorativo: basta não clicar em Aceitar e digitar direto.
        const ticket = fromMe ? await ticketService.get(Number(id), companyId) : null;
        if (fromMe && ticket && (ticket.status_id === 1 || ticket.status_id === 9)) {
            return reply.status(409).send({ error: 'Aceite o atendimento antes de enviar mensagens.' });
        }
        if (fromMe && ticket) {
            try {
                ensureCanSendToTicket(ticket, userId, req.user.profile_tag);
            } catch (err) {
                if (err instanceof SpyTicketPermissionError) return reply.status(403).send({ error: err.message });
                throw err;
            }
        }

        // Assinatura "*Nome:*" (config "Ocultar nome do atendente no chat"):
        // só entra se a empresa tiver a permissão ligada e o atendente não
        // tiver pedido pra ocultar naquele envio específico (flag por request,
        // decidida no client conforme o modo temporário/permanente escolhido).
        let outgoingBody = body;
        if (fromMe && !hideName) {
            const perms = await companyPermissionsReader.forCompany(companyId);
            if (perms.allow_show_name_on_chat) {
                const [sender] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
                if (sender?.name) outgoingBody = withAttendantNamePrefix(body, sender.name);
            }
        }

        const msg = await messageService.save(Number(id), contactId ?? null, outgoingBody, fromMe, companyId, { userId });

        if (fromMe) {
            if (ticket) {
                const contact = await contactService.findById(ticket.contact_id);
                const { whatsappService } = await import('../whatsapp/whatsapp.service');
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
                            const wamid = (result as { wabMessageId?: string } | void)?.wabMessageId;
                            if (!wamid) return;
                            const { db } = await import('../../database/client');
                            const { atendimento_messages } = await import('./atendimento.db.schema');
                            const { eq } = await import('drizzle-orm');
                            await db.update(atendimento_messages)
                                .set({ wab_message_id: wamid, ack: 1 })
                                .where(eq(atendimento_messages.id, msg.id));
                        })
                        .catch((err: Error) => {
                            console.error('[sendMessage] erro no envio WhatsApp:', err.message);
                        });
                } else if (contact?.lid) {
                    // Contato username-only (sem número): responde roteando pelo LID
                    whatsappService.sendMessageViaLid(contact.lid, outgoingBody, connId).catch((err: Error) => {
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

    async listContactTickets(req: FastifyRequest, reply: FastifyReply) {
        const { contactId } = req.params as { contactId: string };
        const companyId = req.user.company_id!;
        const list = await ticketService.listByContact(Number(contactId), companyId);
        return reply.send(list);
    },

    /** Catálogo de produtos para consulta durante o atendimento (carrinho no chat) — leitura, sem exigir admin. */
    async listProdutos(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const list = await produtoCatalog.list(companyId);
        return reply.send(list.filter(p => p.is_active));
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
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        const data = await dashboardService.notSalesByConnection(req.user.company_id!, scope);
        return reply.send(data);
    },

    async dashboardNotSalesByChannel(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        const data = await dashboardService.notSalesByChannel(req.user.company_id!, scope);
        return reply.send(data);
    },

    async dashboardNotSalesByReason(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        const data = await dashboardService.notSalesByReason(req.user.company_id!, scope);
        return reply.send(data);
    },

    async dashboardNotSalesByReasonOverTime(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        const data = await dashboardService.notSalesByReasonOverTime(req.user.company_id!, scope);
        return reply.send(data);
    },

    async dashboardSalesByConnection(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        const data = await dashboardService.salesByConnection(req.user.company_id!, scope);
        return reply.send(data);
    },

    async dashboardSalesByChannel(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        const data = await dashboardService.salesByChannel(req.user.company_id!, scope);
        return reply.send(data);
    },

    async dashboardTopCustomers(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        const { limit } = req.query as { limit?: string };
        const data = await dashboardService.topCustomers(req.user.company_id!, scope, limit ? Number(limit) : undefined);
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
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'superAdmin') {
            const { period: raw } = req.query as { period?: string };
            return reply.send(await dashboardService.getSuperAdminStats(parsePeriod(raw)));
        }

        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getKpis(company_id!, scope));
    },

    async dashGraph(req: FastifyRequest, reply: FastifyReply) {
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'superAdmin') {
            const { period: raw } = req.query as { period?: string };
            return reply.send(await dashboardService.getSuperAdminGraph(parsePeriod(raw)));
        }

        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getGraph(company_id!, scope));
    },

    async dashGraphByStatus(req: FastifyRequest, reply: FastifyReply) {
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send({ period: 'day', data: [] });
        }

        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getGraphByStatus(company_id, scope));
    },

    async dashFunnel(req: FastifyRequest, reply: FastifyReply) {
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboardService.getSuperAdminFunnel());
        }

        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getFunnel(company_id!, scope));
    },

    async dashMovimentos(req: FastifyRequest, reply: FastifyReply) {
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'superAdmin') {
            return reply.send([]);
        }

        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getMovimentos(company_id!, scope));
    },

    async dashRecent(req: FastifyRequest, reply: FastifyReply) {
        const { limit } = req.query as { limit?: string };
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'superAdmin') {
            return reply.send(await dashboardService.getSuperAdminRecent());
        }

        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getRecent(company_id!, Number(limit ?? 5), scope));
    },

    async dashTopAttendants(req: FastifyRequest, reply: FastifyReply) {
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'user') {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }

        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getTopAttendants(company_id, scope));
    },

    async dashChannels(req: FastifyRequest, reply: FastifyReply) {
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }

        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getChannelsByPeriod(company_id, scope));
    },

    async dashTicketsByConnection(req: FastifyRequest, reply: FastifyReply) {
        const { profile_tag, company_id } = req.user;

        if (profile_tag === 'superAdmin' || !company_id) {
            return reply.send([]);
        }

        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getTicketsByConnection(company_id, scope));
    },

    // ────── Financeiro ──────

    async financeiroKpis(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getFinanceiroKpis(req.user.company_id!, scope));
    },

    async financeiroEvolucao(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getFinanceiroEvolucao(req.user.company_id!, scope));
    },

    async financeiroOrigens(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getFinanceiroOrigens(req.user.company_id!, scope));
    },

    async financeiroHistorico(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getFinanceiroHistorico(req.user.company_id!, scope));
    },

    async financeiroPerdas(req: FastifyRequest, reply: FastifyReply) {
        const scope = getDashboardScope(req, reply);
        if (!scope) return;
        return reply.send(await dashboardService.getFinanceiroPerdas(req.user.company_id!, scope));
    },
};
