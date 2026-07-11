"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappOficialRoutes = whatsappOficialRoutes;
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const whatsapp_oficial_controller_1 = require("./whatsapp-oficial.controller");
/**
 * Rotas autenticadas da API Oficial do WhatsApp (Cloud API / Meta).
 * O webhook público (/wabcloudapi/webhook) é registrado direto no server.ts.
 */
async function whatsappOficialRoutes(app) {
    // Onboarding (Embedded Signup ou credenciais manuais)
    app.post('/connections', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_oficial_controller_1.whatsappOficialController.createConnection);
    // Templates de mensagem (obrigatórios fora da janela de 24h)
    app.get('/templates', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_oficial_controller_1.whatsappOficialController.listTemplates);
    app.post('/templates', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_oficial_controller_1.whatsappOficialController.createTemplate);
    app.delete('/templates/:name', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_oficial_controller_1.whatsappOficialController.deleteTemplate);
    // Envio de template
    app.post('/send-template', { preHandler: auth_middleware_1.authMiddleware }, whatsapp_oficial_controller_1.whatsappOficialController.sendTemplate);
}
//# sourceMappingURL=whatsapp-oficial.routes.js.map