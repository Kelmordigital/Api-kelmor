"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendaRoutes = agendaRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const agenda_controller_1 = require("./agenda.controller");
async function agendaRoutes(app) {
    app.get('/', { preHandler: auth_middleware_1.authMiddleware }, agenda_controller_1.agendaController.list);
    app.post('/', { preHandler: auth_middleware_1.authMiddleware }, agenda_controller_1.agendaController.create);
    app.put('/:id', { preHandler: auth_middleware_1.authMiddleware }, agenda_controller_1.agendaController.update);
    app.delete('/:id', { preHandler: auth_middleware_1.authMiddleware }, agenda_controller_1.agendaController.remove);
}
//# sourceMappingURL=agenda.routes.js.map