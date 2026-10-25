"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CupomRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** CRUD de cupons de desconto — restrito a admin/superAdmin. */
class CupomRouter {
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
exports.CupomRouter = CupomRouter;
//# sourceMappingURL=cupom.routes.js.map