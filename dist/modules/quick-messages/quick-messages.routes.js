"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuickMessageRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** Mensagens rápidas — qualquer usuário autenticado da empresa. */
class QuickMessageRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.get('/', this.controller.list);
        app.post('/', this.controller.create);
        app.put('/:id', this.controller.update);
        app.delete('/:id', this.controller.remove);
    };
}
exports.QuickMessageRouter = QuickMessageRouter;
//# sourceMappingURL=quick-messages.routes.js.map