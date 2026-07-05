"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filasRoutes = filasRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const fila_controller_1 = require("./fila.controller");
async function filasRoutes(app) {
    const auth = { preHandler: auth_middleware_1.authMiddleware };
    const adminAuth = { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireAdmin] };
    // Rotas estáticas antes das paramétricas
    app.get('/', auth, fila_controller_1.filaController.list);
    app.get('/all', auth, fila_controller_1.filaController.listAll);
    app.get('/userqueue', auth, fila_controller_1.filaController.listUserQueues);
    app.get('/activequeue', auth, fila_controller_1.filaController.listActive);
    app.get('/:id/:connectionId/users', auth, fila_controller_1.filaController.eligibleUsers);
    app.get('/:id', auth, fila_controller_1.filaController.findById);
    app.post('/', adminAuth, fila_controller_1.filaController.create);
    app.put('/:id', adminAuth, fila_controller_1.filaController.update);
    app.delete('/:id', adminAuth, fila_controller_1.filaController.remove);
}
//# sourceMappingURL=fila.routes.js.map