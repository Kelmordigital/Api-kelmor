"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampanhaRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/**
 * Campanhas (mensagens agendadas) e textos de agendamento — gestão só de
 * admin/superAdmin. Ler os textos é liberado a qualquer usuário da empresa:
 * o atendente escolhe um deles no modal "Agendar mensagem" do atendimento.
 */
class CampanhaRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        const c = this.controller;
        const admin = { preHandler: auth_middleware_1.requireAdmin };
        // Rotas literais antes das com /:id
        app.get('/texts', c.listTexts);
        app.post('/texts', admin, c.createText);
        app.put('/texts/:id', admin, c.updateText);
        app.delete('/texts/:id', admin, c.removeText);
        app.get('/selects', admin, c.getSelects);
        app.get('/', admin, c.list);
        app.post('/', admin, c.create);
        app.put('/:id', admin, c.update);
        app.delete('/:id', admin, c.remove);
        app.post('/:id/play', admin, c.play);
        app.post('/:id/pause', admin, c.pause);
    };
}
exports.CampanhaRouter = CampanhaRouter;
//# sourceMappingURL=campanha.routes.js.map