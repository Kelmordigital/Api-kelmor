import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AchievementsService } from './achievements.service';
/** Adapta HTTP ⇄ AchievementsService. Sempre sobre o usuário autenticado. */
export declare class AchievementsController {
    private readonly service;
    constructor(service: AchievementsService);
    getProgress: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
    complete: (req: FastifyRequest, reply: FastifyReply) => Promise<never>;
}
//# sourceMappingURL=achievements.controller.d.ts.map