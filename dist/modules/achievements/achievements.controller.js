"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.achievementsController = void 0;
const achievements_service_1 = require("./achievements.service");
exports.achievementsController = {
    async getProgress(req, reply) {
        const companyId = req.user.company_id;
        try {
            const progress = await achievements_service_1.achievementsService.getProgress(req.user.id, companyId);
            return reply.send(progress);
        }
        catch (err) {
            if (err instanceof achievements_service_1.GamificationDisabledError) {
                return reply.status(403).send({ error: err.message });
            }
            throw err;
        }
    },
    async complete(req, reply) {
        const companyId = req.user.company_id;
        const { mission_key } = req.body;
        if (!mission_key) {
            return reply.status(400).send({ error: 'Campo "mission_key" é obrigatório' });
        }
        try {
            const progress = await achievements_service_1.achievementsService.completeMission(req.user.id, companyId, mission_key);
            return reply.send(progress);
        }
        catch (err) {
            if (err instanceof achievements_service_1.InvalidMissionKeyError) {
                return reply.status(400).send({ error: err.message });
            }
            if (err instanceof achievements_service_1.GamificationDisabledError) {
                return reply.status(403).send({ error: err.message });
            }
            throw err;
        }
    },
};
//# sourceMappingURL=achievements.controller.js.map