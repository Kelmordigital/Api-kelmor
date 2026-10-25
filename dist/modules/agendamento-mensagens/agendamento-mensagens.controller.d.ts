import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AgendamentoMensagensService } from './agendamento-mensagens.service';
/** Adapta HTTP ⇄ AgendamentoMensagensService. */
export declare class AgendamentoMensagensController {
    private readonly service;
    constructor(service: AgendamentoMensagensService);
    schedule: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    cancel: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=agendamento-mensagens.controller.d.ts.map