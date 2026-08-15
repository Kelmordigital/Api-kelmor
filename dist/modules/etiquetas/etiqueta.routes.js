"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.etiquetasRoutes = etiquetasRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const etiqueta_controller_1 = require("./etiqueta.controller");
const automatic_tag_rule_controller_1 = require("./automatic-tag-rule.controller");
async function etiquetasRoutes(app) {
    app.get('/etiquetas', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.list);
    app.get('/etiquetas/stats', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.stats);
    app.post('/etiquetas', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.create);
    app.put('/etiquetas/:id', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.update);
    app.delete('/etiquetas/:id', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.remove);
    app.get('/contacts/:contactId/etiquetas', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.listDoContato);
    app.post('/contacts/:contactId/etiquetas/:etiquetaId', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.aplicarAoContato);
    app.delete('/contacts/:contactId/etiquetas/:etiquetaId', { preHandler: auth_middleware_1.authMiddleware }, etiqueta_controller_1.etiquetaController.removerDoContato);
    app.get('/etiquetas/regras-automaticas', { preHandler: auth_middleware_1.authMiddleware }, automatic_tag_rule_controller_1.automaticTagRuleController.list);
    app.post('/etiquetas/regras-automaticas', { preHandler: auth_middleware_1.authMiddleware }, automatic_tag_rule_controller_1.automaticTagRuleController.create);
    app.put('/etiquetas/regras-automaticas/:id', { preHandler: auth_middleware_1.authMiddleware }, automatic_tag_rule_controller_1.automaticTagRuleController.update);
    app.delete('/etiquetas/regras-automaticas/:id', { preHandler: auth_middleware_1.authMiddleware }, automatic_tag_rule_controller_1.automaticTagRuleController.remove);
}
//# sourceMappingURL=etiqueta.routes.js.map