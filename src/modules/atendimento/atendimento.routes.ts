import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { atendimentoController } from './atendimento.controller';

export async function atendimentoRoutes(app: FastifyInstance) {
    const auth = { preHandler: authMiddleware };

    // Tickets — listagem e contagem
    app.get('/tickets',                   auth, atendimentoController.listTickets);
    app.get('/tickets/count',             auth, atendimentoController.countTickets);
    app.get('/tickets/status-by-contact', auth, atendimentoController.ticketStatusByContact);

    // Tickets — transições de status
    app.patch('/tickets/:id/assign',  auth, atendimentoController.assignAttendant);
    app.put('/tickets/:id/return',    auth, atendimentoController.returnToQueue);
    app.put('/tickets/:id/reopen',    auth, atendimentoController.reopen);
    app.put('/tickets/:id/transfer',  auth, atendimentoController.transfer);
    app.put('/tickets/:id/pin',       auth, atendimentoController.togglePin);
    app.post('/tickets/:id/schedule-message',  auth, atendimentoController.scheduleMessage);
    app.get('/tickets/:id/scheduled-messages', auth, atendimentoController.listScheduledMessages);
    app.post('/tickets/:id/close',    auth, atendimentoController.closeTicket);
    app.post('/tickets/:id/research', auth, atendimentoController.closeTicketWithResearch);
    app.get('/tickets/:id/research-available', auth, atendimentoController.researchAvailable);
    app.get('/close-config', auth, atendimentoController.closeConfig);
    app.patch('/tickets/:id/status',  auth, atendimentoController.updateStatus);

    // Tickets — venda
    app.put('/tickets/:id/sale', auth, atendimentoController.registerSale);

    // Messages
    app.get('/tickets/:id/messages',  auth, atendimentoController.listMessages);
    app.post('/tickets/:id/messages', auth, atendimentoController.sendMessage);

    // Contacts
    app.get('/contacts/report', auth, atendimentoController.listContactsReport);
    app.get('/contacts/export', auth, atendimentoController.exportContactsExcel);
    app.get('/contacts',        auth, atendimentoController.listContacts);
    app.get('/contacts/:contactId/tickets', auth, atendimentoController.listContactTickets);

    // Catálogo de produtos (consulta durante o atendimento — carrinho no chat)
    app.get('/produtos', auth, atendimentoController.listProdutos);

    // Atendentes da empresa (para transferência)
    app.get('/attendants', auth, atendimentoController.listAttendants);

    // Analytics de vendas (AdminDashboard)
    app.get('/dashboard/sales-by-connection',     auth, atendimentoController.dashboardSalesByConnection);
    app.get('/dashboard/sales-by-channel',        auth, atendimentoController.dashboardSalesByChannel);
    app.get('/dashboard/not-sales-by-connection', auth, atendimentoController.dashboardNotSalesByConnection);
    app.get('/dashboard/not-sales-by-channel',    auth, atendimentoController.dashboardNotSalesByChannel);

    // Dashboard por período (novos)
    app.get('/dashboard/kpis', auth, atendimentoController.dashKpis);
    app.get('/dashboard/graph', auth, atendimentoController.dashGraph);
    app.get('/dashboard/funnel', auth, atendimentoController.dashFunnel);
    app.get('/dashboard/movimentos', auth, atendimentoController.dashMovimentos);
    app.get('/dashboard/recent', auth, atendimentoController.dashRecent);
    app.get('/dashboard/top-attendants', auth, atendimentoController.dashTopAttendants);
    app.get('/dashboard/channels', auth, atendimentoController.dashChannels);
    app.get('/dashboard/tickets-by-connection', auth, atendimentoController.dashTicketsByConnection);

    // CRM reasons CRUD
    app.get('/reasons', auth, atendimentoController.listReasons);
    app.post('/reasons', auth, atendimentoController.createReason);

    // Funil Kanban de atendimento
    app.get('/funil/cards',               auth, atendimentoController.getFunilCards);
    app.post('/funil/leads',              auth, atendimentoController.createFunilLead);
    app.patch('/tickets/:id/funil-stage', auth, atendimentoController.updateFunilStage);

    // Financeiro
    app.get('/financeiro/kpis',      auth, atendimentoController.financeiroKpis);
    app.get('/financeiro/evolucao',  auth, atendimentoController.financeiroEvolucao);
    app.get('/financeiro/origens',   auth, atendimentoController.financeiroOrigens);
    app.get('/financeiro/historico', auth, atendimentoController.financeiroHistorico);
    app.get('/financeiro/perdas',    auth, atendimentoController.financeiroPerdas);
}
