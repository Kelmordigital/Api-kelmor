"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tarefasRoutes = tarefasRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const tarefas_controller_1 = require("./tarefas.controller");
async function tarefasRoutes(app) {
    const auth = { preHandler: auth_middleware_1.authMiddleware };
    // Quadro (Central de Tarefas)
    app.get('/board', auth, tarefas_controller_1.tarefasController.board);
    app.get('/arquivadas', auth, tarefas_controller_1.tarefasController.archived);
    app.get('/contato/:contactId', auth, tarefas_controller_1.tarefasController.byContact);
    // Tarefas
    app.post('/', auth, tarefas_controller_1.tarefasController.create);
    app.put('/:id', auth, tarefas_controller_1.tarefasController.update);
    app.patch('/:id/move', auth, tarefas_controller_1.tarefasController.move);
    app.patch('/:id/concluir', auth, tarefas_controller_1.tarefasController.setDone);
    app.patch('/:id/arquivar', auth, tarefas_controller_1.tarefasController.setArchived);
    app.delete('/:id', auth, tarefas_controller_1.tarefasController.remove);
    // Colunas customizadas
    app.post('/colunas', auth, tarefas_controller_1.tarefasController.createColumn);
    app.put('/colunas/:id', auth, tarefas_controller_1.tarefasController.renameColumn);
    app.delete('/colunas/:id', auth, tarefas_controller_1.tarefasController.deleteColumn);
}
//# sourceMappingURL=tarefas.routes.js.map