import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SchemaValidator } from '../../core/validation/schema-validator';
import { requireCompanyId } from '../../core/http/http-router';
import type { AchievementsService } from './achievements.service';

const MISSION_KEY_REQUIRED = 'Campo "mission_key" é obrigatório';

const completeMissionSchema = z.object({
    mission_key: z.string({ error: MISSION_KEY_REQUIRED }).min(1, MISSION_KEY_REQUIRED),
}, { error: MISSION_KEY_REQUIRED });

/** Adapta HTTP ⇄ AchievementsService. Sempre sobre o usuário autenticado. */
export class AchievementsController {
    constructor(private readonly service: AchievementsService) {}

    getProgress = async (req: FastifyRequest, reply: FastifyReply) => {
        return reply.send(await this.service.getProgress(req.user.id, requireCompanyId(req)));
    };

    complete = async (req: FastifyRequest, reply: FastifyReply) => {
        const companyId = requireCompanyId(req);
        const { mission_key } = SchemaValidator.parse(completeMissionSchema, req.body);
        return reply.send(await this.service.completeMission(req.user.id, companyId, mission_key));
    };
}
