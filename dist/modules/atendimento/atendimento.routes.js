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
    // Tickets — transições de status
    app.patch('/tickets/:id/assign', auth, atendimento_controller_1.atendimentoController.assignAttendant);
    app.put('/tickets/:id/return', auth, atendimento_controller_1.atendimentoController.returnToQueue);
    app.put('/tickets/:id/reopen', auth, atendimento_controller_1.atendimentoController.reopen);
    app.put('/tickets/:id/transfer', auth, atendimento_controller_1.atendimentoController.transfer);
    app.put('/tickets/:id/pin', auth, atendimento_controller_1.atendimentoController.togglePin);
    app.post('/tickets/:id/close', auth, atendimento_controller_1.atendimentoController.closeTicket);
    app.patch('/tickets/:id/status', auth, atendimento_controller_1.atendimentoController.updateStatus);
    // Tickets — venda
    app.put('/tickets/:id/sale', auth, atendimento_controller_1.atendimentoController.registerSale);
    // Messages
    app.get('/tickets/:id/messages', auth, atendimento_controller_1.atendimentoController.listMessages);
    app.post('/tickets/:id/messages', auth, atendimento_controller_1.atendimentoController.sendMessage);
    // Contacts
    app.get('/contacts', auth, atendimento_controller_1.atendimentoController.listContacts);
    // Atendentes da empresa (para transferência)
    app.get('/attendants', auth, atendimento_controller_1.atendimentoController.listAttendants);
    // Analytics de vendas (AdminDashboard)
    app.get('/dashboard/sales-by-connection', auth, atendimento_controller_1.atendimentoController.dashboardSalesByConnection);
    app.get('/dashboard/sales-by-channel', auth, atendimento_controller_1.atendimentoController.dashboardSalesByChannel);
    app.get('/dashboard/not-sales-by-connection', auth, atendimento_controller_1.atendimentoController.dashboardNotSalesByConnection);
    app.get('/dashboard/not-sales-by-channel', auth, atendimento_controller_1.atendimentoController.dashboardNotSalesByChannel);
    // Dashboard por período (novos)
    app.get('/dashboard/kpis', auth, atendimento_controller_1.atendimentoController.dashKpis);
    app.get('/dashboard/graph', auth, atendimento_controller_1.atendimentoController.dashGraph);
    app.get('/dashboard/funnel', auth, atendimento_controller_1.atendimentoController.dashFunnel);
    app.get('/dashboard/movimentos', auth, atendimento_controller_1.atendimentoController.dashMovimentos);
    app.get('/dashboard/recent', auth, atendimento_controller_1.atendimentoController.dashRecent);
    app.get('/dashboard/top-attendants', auth, atendimento_controller_1.atendimentoController.dashTopAttendants);
    app.get('/dashboard/channels', auth, atendimento_controller_1.atendimentoController.dashChannels);
    // CRM reasons CRUD
    app.get('/reasons', auth, atendimento_controller_1.atendimentoController.listReasons);
    app.post('/reasons', auth, atendimento_controller_1.atendimentoController.createReason);
    // Funil Kanban de atendimento
    app.get('/funil/cards', auth, atendimento_controller_1.atendimentoController.getFunilCards);
    app.post('/funil/leads', auth, atendimento_controller_1.atendimentoController.createFunilLead);
    app.patch('/tickets/:id/funil-stage', auth, atendimento_controller_1.atendimentoController.updateFunilStage);
    // Financeiro
    app.get('/financeiro/kpis', auth, atendimento_controller_1.atendimentoController.financeiroKpis);
    app.get('/financeiro/evolucao', auth, atendimento_controller_1.atendimentoController.financeiroEvolucao);
    app.get('/financeiro/origens', auth, atendimento_controller_1.atendimentoController.financeiroOrigens);
    app.get('/financeiro/historico', auth, atendimento_controller_1.atendimentoController.financeiroHistorico);
    app.get('/financeiro/perdas', auth, atendimento_controller_1.atendimentoController.financeiroPerdas);
}
//# sourceMappingURL=atendimento.routes.js.map