"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cuponsRoutes = cuponsRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const cupom_controller_1 = require("./cupom.controller");
async function cuponsRoutes(app) {
    app.addHook('preHandler', auth_middleware_1.authMiddleware);
    app.get('/', cupom_controller_1.cupomController.list);
    app.post('/', cupom_controller_1.cupomController.create);
    app.put('/:id', cupom_controller_1.cupomController.update);
    app.delete('/:id', cupom_controller_1.cupomController.remove);
}
//# sourceMappingURL=cupom.routes.js.map