"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmReportsRoutes = crmReportsRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const crm_reports_controller_1 = require("./crm-reports.controller");
async function crmReportsRoutes(app) {
    const auth = { preHandler: auth_middleware_1.authMiddleware };
    app.get('/sales-made', auth, crm_reports_controller_1.crmReportsController.salesMade);
    app.get('/sales-not-made', auth, crm_reports_controller_1.crmReportsController.salesNotMade);
    app.get('/reasons-select', auth, crm_reports_controller_1.crmReportsController.reasons);
    app.get('/channels-select', auth, crm_reports_controller_1.crmReportsController.channels);
    app.put('/:ticketId', auth, crm_reports_controller_1.crmReportsController.updateSale);
}
//# sourceMappingURL=crm-reports.routes.js.map