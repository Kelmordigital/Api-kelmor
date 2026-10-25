import type { FastifyRequest, FastifyReply } from 'fastify';
import type { EtiquetaService } from './etiqueta.service';
import type { AutomaticTagRuleService } from './automatic-tag-rule.service';
/** Adapta HTTP ⇄ EtiquetaService. */
export declare class EtiquetaController {
    private readonly service;
    constructor(service: EtiquetaService);
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    stats: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    listForContact: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    applyToContact: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    removeFromContact: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
/** Adapta HTTP ⇄ AutomaticTagRuleService. */
export declare class AutomaticTagRuleController {
    private readonly service;
    constructor(service: AutomaticTagRuleService);
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=etiqueta.controller.d.ts.map