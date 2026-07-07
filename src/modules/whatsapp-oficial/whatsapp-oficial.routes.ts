import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { whatsappOficialController } from './whatsapp-oficial.controller';

/**
 * Rotas autenticadas da API Oficial do WhatsApp (Cloud API / Meta).
 * O webhook público (/wabcloudapi/webhook) é registrado direto no server.ts.
 */
export async function whatsappOficialRoutes(app: FastifyInstance) {
    // Onboarding (Embedded Signup ou credenciais manuais)
    app.post('/connections', { preHandler: authMiddleware }, whatsappOficialController.createConnection);

    // Templates de mensagem (obrigatórios fora da janela de 24h)
    app.get('/templates',           { preHandler: authMiddleware }, whatsappOficialController.listTemplates);
    app.post('/templates',          { preHandler: authMiddleware }, whatsappOficialController.createTemplate);
    app.delete('/templates/:name',  { preHandler: authMiddleware }, whatsappOficialController.deleteTemplate);

    // Envio de template
    app.post('/send-template', { preHandler: authMiddleware }, whatsappOficialController.sendTemplate);
}
