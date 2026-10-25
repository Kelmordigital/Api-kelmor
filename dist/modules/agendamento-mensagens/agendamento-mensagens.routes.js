"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgendamentoMensagensRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** Agendar mensagem para o contato de um ticket — qualquer usuário autenticado da empresa. */
class AgendamentoMensagensRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.post('/tickets/:id/schedule-message', this.controller.schedule);
        app.get('/tickets/:id/scheduled-messages', this.controller.list);
        // Só enquanto a mensagem aguarda envio (409 depois)
        app.put('/scheduled-messages/:id', this.controller.update);
        app.delete('/scheduled-messages/:id', this.controller.cancel);
    };
}
exports.AgendamentoMensagensRouter = AgendamentoMensagensRouter;
//# sourceMappingURL=agendamento-mensagens.routes.js.map