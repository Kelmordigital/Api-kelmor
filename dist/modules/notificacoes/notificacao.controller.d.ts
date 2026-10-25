import type { FastifyRequest, FastifyReply } from 'fastify';
import type { NotificationService } from './notificacao.service';
/** Notificações do próprio usuário. */
export declare class NotificacaoController {
    private readonly service;
    constructor(service: NotificationService);
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    markRead: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    markAllRead: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=notificacao.controller.d.ts.map