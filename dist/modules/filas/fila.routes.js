"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filasRoutes = filasRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const fila_controller_1 = require("./fila.controller");
async function filasRoutes(app) {
    app.get('/', { preHandler: auth_middleware_1.authMiddleware }, fila_controller_1.filaController.list);
    app.post('/', { preHandler: auth_middleware_1.authMiddleware }, fila_controller_1.filaController.create);
    app.put('/:id', { preHandler: auth_middleware_1.authMiddleware }, fila_controller_1.filaController.update);
    app.delete('/:id', { preHandler: auth_middleware_1.authMiddleware }, fila_controller_1.filaController.remove);
}
//# sourceMappingURL=fila.routes.js.map