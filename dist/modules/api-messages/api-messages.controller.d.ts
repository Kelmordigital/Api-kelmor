import type { FastifyRequest, FastifyReply } from 'fastify';
import { type ApiKeyService, type ApiMessageService } from './api-messages.service';
/** Adapta HTTP ⇄ envio por API (público) e gestão da chave (admin). */
export declare class ApiMessagesController {
    private readonly keys;
    private readonly messages;
    constructor(keys: ApiKeyService, messages: ApiMessageService);
    /** POST /api-messages/send — autenticado por X-Api-Key; erros no formato da API pública. */
    send: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    status: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    generate: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    revoke: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=api-messages.controller.d.ts.map