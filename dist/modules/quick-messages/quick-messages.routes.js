"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quickMessagesRoutes = quickMessagesRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const quick_messages_controller_1 = require("./quick-messages.controller");
async function quickMessagesRoutes(app) {
    const auth = { preHandler: auth_middleware_1.authMiddleware };
    app.get('/', auth, quick_messages_controller_1.quickMessagesController.list);
    app.post('/', auth, quick_messages_controller_1.quickMessagesController.create);
    app.put('/:id', auth, quick_messages_controller_1.quickMessagesController.update);
    app.delete('/:id', auth, quick_messages_controller_1.quickMessagesController.remove);
}
//# sourceMappingURL=quick-messages.routes.js.map