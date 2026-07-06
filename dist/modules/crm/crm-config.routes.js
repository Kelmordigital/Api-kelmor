"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmConfigRoutes = crmConfigRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const crm_config_controller_1 = require("./crm-config.controller");
async function crmConfigRoutes(app) {
    const auth = { preHandler: auth_middleware_1.authMiddleware };
    app.get('/reasons', auth, crm_config_controller_1.crmConfigController.listReasons);
    app.post('/reasons', auth, crm_config_controller_1.crmConfigController.createReason);
    app.put('/reasons/:id', auth, crm_config_controller_1.crmConfigController.updateReason);
    app.delete('/reasons/:id', auth, crm_config_controller_1.crmConfigController.deleteReason);
    app.get('/keywords', auth, crm_config_controller_1.crmConfigController.listKeywords);
    app.post('/keywords', auth, crm_config_controller_1.crmConfigController.createKeyword);
    app.delete('/keywords/:id', auth, crm_config_controller_1.crmConfigController.deleteKeyword);
}
//# sourceMappingURL=crm-config.routes.js.map