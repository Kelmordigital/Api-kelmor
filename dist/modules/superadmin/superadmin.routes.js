"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.superadminRoutes = superadminRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const superadmin_controller_1 = require("./superadmin.controller");
const monitoring_controller_1 = require("../monitoring/monitoring.controller");
async function superadminRoutes(app) {
    const guard = { preHandler: [auth_middleware_1.authMiddleware, auth_middleware_1.requireSuperAdmin] };
    app.get('/stats', guard, superadmin_controller_1.superadminController.stats);
    app.get('/metrics/history', guard, monitoring_controller_1.monitoringController.metricsHistory);
    app.get('/companies', guard, superadmin_controller_1.superadminController.listCompanies);
    app.post('/companies', guard, superadmin_controller_1.superadminController.createCompany);
    app.patch('/companies/:id', guard, superadmin_controller_1.superadminController.updateCompany);
    app.patch('/companies/:id/status', guard, superadmin_controller_1.superadminController.setCompanyStatus);
    app.patch('/users/:id/approve', guard, superadmin_controller_1.superadminController.approveUser);
    app.patch('/users/:id/revoke', guard, superadmin_controller_1.superadminController.revokeUser);
}
//# sourceMappingURL=superadmin.routes.js.map