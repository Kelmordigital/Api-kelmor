"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.etiquetasRoutes = etiquetasRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const etiqueta_controller_1 = require("./etiqueta.controller");
async function etiquetasRoutes(app) {
    app.get('/etiquetas', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.list);
    app.get('/etiquetas/stats', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.stats);
    app.post('/etiquetas', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.create);
    app.put('/etiquetas/:id', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.update);
    app.delete('/etiquetas/:id', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.remove);
    app.get('/contacts/:contactId/etiquetas', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.listDoContato);
    app.post('/contacts/:contactId/etiquetas/:etiquetaId', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.aplicarAoContato);
    app.delete('/contacts/:contactId/etiquetas/:etiquetaId', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.removerDoContato);
}
//# sourceMappingURL=etiqueta.routes.js.map