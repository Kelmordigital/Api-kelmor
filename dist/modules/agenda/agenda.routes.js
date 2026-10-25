"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgendaRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** Agenda da empresa — restrita a admin/superAdmin. */
class AgendaRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.addHook('preHandler', auth_middleware_1.requireAdmin);
        app.get('/', this.controller.list);
        app.post('/', this.controller.create);
        app.put('/:id', this.controller.update);
        app.delete('/:id', this.controller.remove);
    };
}
exports.AgendaRouter = AgendaRouter;
//# sourceMappingURL=agenda.routes.js.map