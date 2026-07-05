"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pesquisasRoutes = pesquisasRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const pesquisa_controller_1 = require("./pesquisa.controller");
async function pesquisasRoutes(app) {
    app.addHook('preHandler', auth_middleware_1.authMiddleware);
    app.get('/active', pesquisa_controller_1.pesquisaController.listActive);
    app.get('/', pesquisa_controller_1.pesquisaController.list);
    app.post('/', pesquisa_controller_1.pesquisaController.create);
    app.put('/:id', pesquisa_controller_1.pesquisaController.update);
    app.delete('/:id', pesquisa_controller_1.pesquisaController.remove);
    // Relatório
    app.get('/report', pesquisa_controller_1.pesquisaController.report);
    app.get('/report/view', pesquisa_controller_1.pesquisaController.reportView);
}
//# sourceMappingURL=pesquisa.routes.js.map