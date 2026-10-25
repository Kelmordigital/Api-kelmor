"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsuarioRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** Gestão de usuários da empresa — restrita a admin/superAdmin. */
class UsuarioRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.addHook('preHandler', auth_middleware_1.requireAdmin);
        app.get('/selects', this.controller.listSelects);
        app.get('/', this.controller.list);
        app.post('/', this.controller.create);
        app.put('/:id', this.controller.update);
        app.delete('/:id', this.controller.remove);
    };
}
exports.UsuarioRouter = UsuarioRouter;
//# sourceMappingURL=usuario.routes.js.map