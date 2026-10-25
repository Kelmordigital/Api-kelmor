import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFormReader } from '../../core/http/multipart-form-reader';
import type { QuickMessageService } from './quick-messages.service';
/** Adapta HTTP ⇄ QuickMessageService: lê query/multipart e escolhe o status. */
export declare class QuickMessageController {
    private readonly service;
    private readonly formReader;
    constructor(service: QuickMessageService, formReader: MultipartFormReader);
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    private folderFor;
}
//# sourceMappingURL=quick-messages.controller.d.ts.map