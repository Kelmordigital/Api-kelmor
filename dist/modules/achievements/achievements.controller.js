"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AchievementsController = void 0;
const zod_1 = require("zod");
const schema_validator_1 = require("../../core/validation/schema-validator");
const http_router_1 = require("../../core/http/http-router");
const MISSION_KEY_REQUIRED = 'Campo "mission_key" é obrigatório';
const completeMissionSchema = zod_1.z.object({
    mission_key: zod_1.z.string({ error: MISSION_KEY_REQUIRED }).min(1, MISSION_KEY_REQUIRED),
}, { error: MISSION_KEY_REQUIRED });
/** Adapta HTTP ⇄ AchievementsService. Sempre sobre o usuário autenticado. */
class AchievementsController {
    service;
    constructor(service) {
        this.service = service;
    }
    getProgress = async (req, reply) => {
        return reply.send(await this.service.getProgress(req.user.id, (0, http_router_1.requireCompanyId)(req)));
    };
    complete = async (req, reply) => {
        const companyId = (0, http_router_1.requireCompanyId)(req);
        const { mission_key } = schema_validator_1.SchemaValidator.parse(completeMissionSchema, req.body);
        return reply.send(await this.service.completeMission(req.user.id, companyId, mission_key));
    };
}
exports.AchievementsController = AchievementsController;
//# sourceMappingURL=achievements.controller.js.map