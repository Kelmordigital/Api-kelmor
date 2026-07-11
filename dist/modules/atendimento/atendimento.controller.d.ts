import { FastifyRequest, FastifyReply } from 'fastify';
export declare const atendimentoController: {
    listTickets(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    closeTicket(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    /** Dados leves pro modal de fechamento (mensagem de despedida + se a opção "com mensagem" deve aparecer) — sem exigir admin. */
    closeConfig(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    /** Alternativa exclusiva à despedida: fecha com pesquisa de satisfação (ticket só fecha de fato quando o cliente responder). */
    closeTicketWithResearch(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    /** Indica se o ticket tem pesquisa de satisfação disponível (fila vinculada a uma pesquisa ativa) — usado pra mostrar/esconder a opção na hora de fechar. */
    researchAvailable(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    updateStatus(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    assignAttendant(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    returnToQueue(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    reopen(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    transfer(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    togglePin(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    countTickets(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    listAttendants(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    createFunilLead(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    getFunilCards(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    updateFunilStage(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    registerSale(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    listMessages(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    sendMessage(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    ticketStatusByContact(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    listContacts(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    listContactTickets(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    /** Catálogo de produtos para consulta durante o atendimento (carrinho no chat) — leitura, sem exigir admin. */
    listProdutos(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    listContactsReport(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    exportContactsExcel(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashboardNotSalesByConnection(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashboardNotSalesByChannel(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashboardSalesByConnection(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashboardSalesByChannel(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    listReasons(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    createReason(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashKpis(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashGraph(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashFunnel(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashMovimentos(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashRecent(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashTopAttendants(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    dashChannels(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    financeiroKpis(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    financeiroEvolucao(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    financeiroOrigens(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    financeiroHistorico(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    financeiroPerdas(req: FastifyRequest, reply: FastifyReply): Promise<never>;
};
//# sourceMappingURL=atendimento.controller.d.ts.map