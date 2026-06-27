"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usuariosRoutes = usuariosRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const usuario_controller_1 = require("./usuario.controller");
async function usuariosRoutes(app) {
    app.addHook('preHandler', auth_middleware_1.authMiddleware);
    app.get('/selects', usuario_controller_1.usuarioController.listSelects);
    app.get('/', usuario_controller_1.usuarioController.list);
    app.post('/', usuario_controller_1.usuarioController.create);
    app.put('/:id', usuario_controller_1.usuarioController.update);
    app.delete('/:id', usuario_controller_1.usuarioController.remove);
}
//# sourceMappingURL=usuario.routes.js.map