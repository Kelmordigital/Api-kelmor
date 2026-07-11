import { FastifyRequest, FastifyReply } from 'fastify';
export declare const whatsappOficialController: {
    /** Handshake: a Meta faz um GET ao cadastrar a URL e espera o hub.challenge de volta. */
    verifyWebhook(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    /** Eventos (messages/statuses). Responde 200 rápido — a Meta reenvia se demorar. */
    webhook(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    createConnection(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    listTemplates(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    createTemplate(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    deleteTemplate(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    sendTemplate(req: FastifyRequest, reply: FastifyReply): Promise<never>;
};
//# sourceMappingURL=whatsapp-oficial.controller.d.ts.map