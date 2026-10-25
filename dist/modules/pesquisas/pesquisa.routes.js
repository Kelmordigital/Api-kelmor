"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PesquisaRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** Cadastro e relatório de pesquisas — restrito a admin/superAdmin. */
class PesquisaRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        app.addHook('preHandler', auth_middleware_1.requireAdmin);
        const c = this.controller;
        app.get('/active', c.listActive);
        app.get('/', c.list);
        app.post('/', c.create);
        app.put('/:id', c.update);
        app.delete('/:id', c.remove);
        // Relatório
        app.get('/report', c.report);
        app.get('/report/view', c.reportView);
    };
}
exports.PesquisaRouter = PesquisaRouter;
//# sourceMappingURL=pesquisa.routes.js.map