import { FastifyRequest, FastifyReply } from 'fastify';
import { achievementsService, InvalidMissionKeyError } from './achievements.service';

export const achievementsController = {

    async getProgress(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const progress = await achievementsService.getProgress(req.user.id, companyId);
        return reply.send(progress);
    },

    async complete(req: FastifyRequest, reply: FastifyReply) {
        const companyId = req.user.company_id!;
        const { mission_key } = req.body as { mission_key?: string };

        if (!mission_key) {
            return reply.status(400).send({ error: 'Campo "mission_key" é obrigatório' });
        }

        try {
            const progress = await achievementsService.completeMission(req.user.id, companyId, mission_key);
            return reply.send(progress);
        } catch (err) {
            if (err instanceof InvalidMissionKeyError) {
                return reply.status(400).send({ error: err.message });
            }
            throw err;
        }
    },
};
