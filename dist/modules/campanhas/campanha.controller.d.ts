import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CampaignService, ScheduledTextService } from './campanha.service';
/** Adapta HTTP ⇄ campanhas e textos de agendamento. */
export declare class CampanhaController {
    private readonly campaigns;
    private readonly texts;
    constructor(campaigns: CampaignService, texts: ScheduledTextService);
    list: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    getSelects: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    create: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    update: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    remove: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    play: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    pause: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    listTexts: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    createText: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    updateText: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    removeText: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=campanha.controller.d.ts.map