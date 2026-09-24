"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.atendimentoRoutes = atendimentoRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const atendimento_controller_1 = require("./atendimento.controller");
async function atendimentoRoutes(app) {
    const auth = { preHandler: auth_middleware_1.authMiddleware };
    // Tickets — listagem e contagem
    app.get('/tickets', auth, atendimento_controller_1.atendimentoController.listTickets);
    app.get('/tickets/count', auth, atendimento_controller_1.atendimentoController.countTickets);
    app.get('/tickets/status-by-contact', auth, atendimento_controller_1.atendimentoController.ticketStatusByContact);
    // Tickets — transições de status
    app.patch('/tickets/:id/assign', auth, atendimento_controller_1.atendimentoController.assignAttendant);
    app.put('/tickets/:id/return', auth, atendimento_controller_1.atendimentoController.returnToQueue);
    app.put('/tickets/:id/reopen', auth, atendimento_controller_1.atendimentoController.reopen);
    app.put('/tickets/:id/transfer', auth, atendimento_controller_1.atendimentoController.transfer);
    app.put('/tickets/:id/pin', auth, atendimento_controller_1.atendimentoController.togglePin);
    app.post('/tickets/:id/schedule-message', auth, atendimento_controller_1.atendimentoController.scheduleMessage);
    app.get('/tickets/:id/scheduled-messages', auth, atendimento_controller_1.atendimentoController.listScheduledMessages);
    app.post('/tickets/:id/close', auth, atendimento_controller_1.atendimentoController.closeTicket);
    app.post('/tickets/:id/research', auth, atendimento_controller_1.atendimentoController.closeTicketWithResearch);
    app.get('/tickets/:id/research-available', auth, atendimento_controller_1.atendimentoController.researchAvailable);
    app.get('/close-config', auth, atendimento_controller_1.atendimentoController.closeConfig);
    app.patch('/tickets/:id/status', auth, atendimento_controller_1.atendimentoController.updateStatus);
    // Tickets — venda
    app.put('/tickets/:id/sale', auth, atendimento_controller_1.atendimentoController.registerSale);
    // Messages
    app.get('/tickets/:id/messages', auth, atendimento_controller_1.atendimentoController.listMessages);
    app.post('/tickets/:id/messages', auth, atendimento_controller_1.atendimentoController.sendMessage);
    // Contacts
    app.get('/contacts/report', auth, atendimento_controller_1.atendimentoController.listContactsReport);
    app.get('/contacts/export', auth, atendimento_controller_1.atendimentoController.exportContactsExcel);
    app.get('/contacts', auth, atendimento_controller_1.atendimentoController.listContacts);
    app.get('/contacts/:contactId/tickets', auth, atendimento_controller_1.atendimentoController.listContactTickets);
    // Catálogo de produtos (consulta durante o atendimento — carrinho no chat)
    app.get('/produtos', auth, atendimento_controller_1.atendimentoController.listProdutos);
    // Atendentes da empresa (para transferência)
    app.get('/attendants', auth, atendimento_controller_1.atendimentoController.listAttendants);
    // Analytics de vendas (AdminDashboard)
    app.get('/dashboard/sales-by-connection', auth, atendimento_controller_1.atendimentoController.dashboardSalesByConnection);
    app.get('/dashboard/sales-by-channel', auth, atendimento_controller_1.atendimentoController.dashboardSalesByChannel);
    app.get('/dashboard/top-customers', auth, atendimento_controller_1.atendimentoController.dashboardTopCustomers);
    app.get('/dashboard/not-sales-by-connection', auth, atendimento_controller_1.atendimentoController.dashboardNotSalesByConnection);
    app.get('/dashboard/not-sales-by-channel', auth, atendimento_controller_1.atendimentoController.dashboardNotSalesByChannel);
    app.get('/dashboard/not-sales-by-reason', auth, atendimento_controller_1.atendimentoController.dashboardNotSalesByReason);
    app.get('/dashboard/not-sales-by-reason-over-time', auth, atendimento_controller_1.atendimentoController.dashboardNotSalesByReasonOverTime);
    // Dashboard por período (novos)
    app.get('/dashboard/kpis', auth, atendimento_controller_1.atendimentoController.dashKpis);
    app.get('/dashboard/graph', auth, atendimento_controller_1.atendimentoController.dashGraph);
    app.get('/dashboard/graph-by-status', auth, atendimento_controller_1.atendimentoController.dashGraphByStatus);
    app.get('/dashboard/funnel', auth, atendimento_controller_1.atendimentoController.dashFunnel);
    app.get('/dashboard/movimentos', auth, atendimento_controller_1.atendimentoController.dashMovimentos);
    app.get('/dashboard/recent', auth, atendimento_controller_1.atendimentoController.dashRecent);
    app.get('/dashboard/top-attendants', auth, atendimento_controller_1.atendimentoController.dashTopAttendants);
    app.get('/dashboard/channels', auth, atendimento_controller_1.atendimentoController.dashChannels);
    app.get('/dashboard/tickets-by-connection', auth, atendimento_controller_1.atendimentoController.dashTicketsByConnection);
    // CRM reasons CRUD
    app.get('/reasons', auth, atendimento_controller_1.atendimentoController.listReasons);
    app.post('/reasons', auth, atendimento_controller_1.atendimentoController.createReason);
    // Funil Kanban de atendimento
    app.get('/funil/cards', auth, atendimento_controller_1.atendimentoController.getFunilCards);
    app.post('/funil/leads', auth, atendimento_controller_1.atendimentoController.createFunilLead);
    app.patch('/tickets/:id/funil-stage', auth, atendimento_controller_1.atendimentoController.moveTicketFunilStage);
    app.get('/funil/stages', auth, atendimento_controller_1.atendimentoController.listFunilStages);
    app.post('/funil/stages', auth, atendimento_controller_1.atendimentoController.createFunilStage);
    app.put('/funil/stages/reorder', auth, atendimento_controller_1.atendimentoController.reorderFunilStages);
    app.put('/funil/stages/:id', auth, atendimento_controller_1.atendimentoController.updateFunilStage);
    app.delete('/funil/stages/:id', auth, atendimento_controller_1.atendimentoController.deleteFunilStage);
    app.get('/funil/analytics', auth, atendimento_controller_1.atendimentoController.getFunilAnalytics);
    // Financeiro
    app.get('/financeiro/kpis', auth, atendimento_controller_1.atendimentoController.financeiroKpis);
    app.get('/financeiro/evolucao', auth, atendimento_controller_1.atendimentoController.financeiroEvolucao);
    app.get('/financeiro/origens', auth, atendimento_controller_1.atendimentoController.financeiroOrigens);
    app.get('/financeiro/historico', auth, atendimento_controller_1.atendimentoController.financeiroHistorico);
    app.get('/financeiro/perdas', auth, atendimento_controller_1.atendimentoController.financeiroPerdas);
}
//# sourceMappingURL=atendimento.routes.js.map