import { FastifyRequest, FastifyReply } from 'fastify';
export declare const apiMessagesController: {
    /** POST /api-messages/send — autenticado por header X-Api-Key, não por JWT de usuário. */
    send(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    status(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    generate(req: FastifyRequest, reply: FastifyReply): Promise<never>;
    revoke(req: FastifyRequest, reply: FastifyReply): Promise<never>;
};
//# sourceMappingURL=api-messages.controller.d.ts.map