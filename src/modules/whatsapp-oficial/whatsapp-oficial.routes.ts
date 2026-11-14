import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireAdmin } from '../../middlewares/auth.middleware';
import type { HttpRouter } from '../../core/http/http-router';
import type { CloudWebhookController, WhatsappOficialController } from './whatsapp-oficial.controller';

/**
 * Registrado em /api/v1/whatsapp-oficial. RN-WAB-01: conectar número e
 * criar/excluir templates é do admin; listar e enviar templates, de qualquer
 * usuário da empresa (o atendente precisa deles para falar fora da janela de 24 h).
 */
export class WhatsappOficialRouter implements HttpRouter {
    constructor(private readonly controller: WhatsappOficialController) {}

    register = async (app: FastifyInstance) => {
        app.addHook('preHandler', authMiddleware);
        const c = this.controller;
        const adminOnly = { preHandler: requireAdmin };

        app.post('/connections',              adminOnly, c.createConnection);
        app.get('/templates',                            c.listTemplates);
        app.post('/templates',                adminOnly, c.createTemplate);
        app.delete('/templates/:name',        adminOnly, c.deleteTemplate);
        app.post('/send-template',                       c.sendTemplate);
    };
}

/**
 * Webhook da Meta, sem prefixo e sem login (RN-WAB-11: autenticado pela
 * assinatura). Fora do limite de requisições: os avisos de uma conta
 * movimentada chegam todos dos mesmos servidores da Meta.
 */
export class CloudWebhookRouter implements HttpRouter {
    constructor(private readonly controller: CloudWebhookController) {}

    register = async (app: FastifyInstance) => {
        app.get('/wabcloudapi/webhook',  this.controller.verify);
        app.post('/wabcloudapi/webhook', { config: { rateLimit: false } }, this.controller.receive);
    };
}
