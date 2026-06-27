"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.botsRoutes = botsRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const bots_controller_1 = require("./bots.controller");
async function botsRoutes(app) {
    const auth = { preHandler: auth_middleware_1.authMiddleware };
    app.get('/', auth, bots_controller_1.botsController.list);
    app.post('/', auth, bots_controller_1.botsController.create);
    app.put('/:id', auth, bots_controller_1.botsController.update);
    app.delete('/:id', auth, bots_controller_1.botsController.remove);
    app.patch('/:id/toggle-active', auth, bots_controller_1.botsController.toggleActive);
    app.patch('/:id/set-default', auth, bots_controller_1.botsController.setDefault);
    app.get('/:id/nodes', auth, bots_controller_1.botsController.getNodes);
    app.post('/:id/nodes/sync', auth, bots_controller_1.botsController.syncNodes);
}
//# sourceMappingURL=bots.routes.js.map