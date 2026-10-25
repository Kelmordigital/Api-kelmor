import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TarefasService } from './tarefas.service';
/** Adapta HTTP ⇄ TarefasService. */
export declare class TarefasController {
    private readonly service;
    constructor(service: TarefasService);
    board: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    archived: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    byContact: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    move: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    setDone: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    setArchived: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    createColumn: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    renameColumn: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    deleteColumn: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    private viewer;
}
//# sourceMappingURL=tarefas.controller.d.ts.map