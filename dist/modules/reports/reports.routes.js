"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsRoutes = reportsRoutes;
exports.reportTicketsRoutes = reportTicketsRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const reports_controller_1 = require("./reports.controller");
// Registrado em /api/v1/reports
async function reportsRoutes(app) {
    app.get('/tickets/user', { preHandler: auth_middleware_1.authMiddleware }, reports_controller_1.reportsController.getTicketsUser);
    app.get('/ticket/average', { preHandler: auth_middleware_1.authMiddleware }, reports_controller_1.reportsController.getAverage);
}
// Registrado em /api/v1/reporttickets
async function reportTicketsRoutes(app) {
    app.get('/tickets/clienttickets', { preHandler: auth_middleware_1.authMiddleware }, reports_controller_1.reportsController.getClientTickets);
}
//# sourceMappingURL=reports.routes.js.map