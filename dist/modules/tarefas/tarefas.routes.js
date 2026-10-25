"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TarefasRouter = void 0;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
/** Central de Tarefas — qualquer usuário autenticado, sobre o próprio quadro. */
class TarefasRouter {
    controller;
    constructor(controller) {
        this.controller = controller;
    }
    register = async (app) => {
        app.addHook('preHandler', auth_middleware_1.authMiddleware);
        const c = this.controller;
        // Quadro (Central de Tarefas)
        app.get('/board', c.board);
        app.get('/arquivadas', c.archived);
        app.get('/contato/:contactId', c.byContact);
        // Tarefas
        app.post('/', c.create);
        app.put('/:id', c.update);
        app.patch('/:id/move', c.move);
        app.patch('/:id/concluir', c.setDone);
        app.patch('/:id/arquivar', c.setArchived);
        app.delete('/:id', c.remove);
        // Colunas customizadas
        app.post('/colunas', c.createColumn);
        app.put('/colunas/:id', c.renameColumn);
        app.delete('/colunas/:id', c.deleteColumn);
    };
}
exports.TarefasRouter = TarefasRouter;
//# sourceMappingURL=tarefas.routes.js.map