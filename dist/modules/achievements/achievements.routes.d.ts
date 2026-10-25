import type { FastifyInstance } from 'fastify';
import type { HttpRouter } from '../../core/http/http-router';
import type { AchievementsController } from './achievements.controller';
export declare class AchievementsRouter implements HttpRouter {
    private readonly controller;
    constructor(controller: AchievementsController);
    register: (app: FastifyInstance) => Promise<void>;
}
//# sourceMappingURL=achievements.routes.d.ts.map