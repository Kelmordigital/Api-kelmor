"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificacaoRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** Sino de notificações — cada usuário vê e marca só as suas. */
class NotificacaoRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.get('/', this.controller.list);
        app.post('/read-all', this.controller.markAllRead);
        app.post('/:id/read', this.controller.markRead);
    };
}
exports.NotificacaoRouter = NotificacaoRouter;
//# sourceMappingURL=notificacao.routes.js.map