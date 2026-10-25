"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProdutoRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** CRUD do catálogo de produtos — restrito a admin/superAdmin. */
class ProdutoRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.addHook('preHandler', auth_middleware_1.requireAdmin);
        app.get('/', this.controller.list);
        app.get('/:id', this.controller.findById);
        app.post('/', this.controller.create);
        app.put('/:id', this.controller.update);
        app.delete('/:id', this.controller.remove);
    };
}
exports.ProdutoRouter = ProdutoRouter;
//# sourceMappingURL=produto.routes.js.map